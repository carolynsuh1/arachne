"""Step 1: Goal → Network Agent.

Writes only Goal and GoalPlan rows.
Does not read people/orgs/relationships.
Does not call Dropbox or Elasticsearch.
Teammates read GoalPlan for step 3 (dynamic graph views).
"""
import json
import os
import re
from datetime import datetime, timezone
from uuid import uuid4

import httpx
from sqlalchemy.orm import Session

from ..models import Goal, GoalPlan
from ..schemas import GoalNetworkOut, GoalOut, NeededConnection, Subgoal

OPENAI_URL = "https://api.openai.com/v1/chat/completions"


def analyze_goal(db: Session, text: str) -> GoalNetworkOut:
    """Agent 1: turn a goal into subgoals and the kinds of people to know next."""
    goal = Goal(
        id=str(uuid4()),
        text=text.strip(),
        created_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    db.add(goal)

    plan, provider = _try_openai(goal.text)
    if plan is None:
        plan = _heuristic_plan(goal.text)
        provider = "heuristic"

    record = GoalPlan(
        goal_id=goal.id,
        summary=plan["summary"],
        subgoals_json=json.dumps(plan["subgoals"]),
        needed_connections_json=json.dumps(plan["needed_connections"]),
        provider=provider,
    )
    db.add(record)
    db.commit()
    db.refresh(goal)

    return GoalNetworkOut(
        goal=GoalOut.model_validate(goal),
        summary=plan["summary"],
        subgoals=[Subgoal.model_validate(item) for item in plan["subgoals"]],
        needed_connections=[
            NeededConnection.model_validate(item) for item in plan["needed_connections"]
        ],
        provider=provider,
    )


def load_plan(db: Session, goal_id: str) -> GoalNetworkOut | None:
    goal = db.get(Goal, goal_id)
    plan = db.get(GoalPlan, goal_id)
    if goal is None or plan is None:
        return None
    return GoalNetworkOut(
        goal=GoalOut.model_validate(goal),
        summary=plan.summary,
        subgoals=[Subgoal.model_validate(item) for item in json.loads(plan.subgoals_json)],
        needed_connections=[
            NeededConnection.model_validate(item)
            for item in json.loads(plan.needed_connections_json)
        ],
        provider=plan.provider,
    )


def _try_openai(text: str) -> tuple[dict | None, str]:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None, "heuristic"

    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    prompt = {
        "summary": "one sentence restating the user's goal",
        "subgoals": [{"text": "small next step", "why": "why this step matters"}],
        "needed_connections": [
            {
                "kind": "faculty advisor | lab manager | current student | alumni | recruiter",
                "query": "short search phrase",
                "why": "why this kind of person helps",
            }
        ],
    }
    payload = {
        "model": model,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "messages": [
            {
                "role": "system",
                "content": (
                    "You are the Goal to Network Agent. The user is not searching a "
                    "contact list. They tell you what they want to accomplish. "
                    "Decompose the goal into 3-5 subgoals and 3-5 kinds of people "
                    "or organizations they should know next. Return JSON only, "
                    f"matching this shape: {json.dumps(prompt)}"
                ),
            },
            {"role": "user", "content": text},
        ],
    }
    try:
        response = httpx.post(
            OPENAI_URL,
            headers={"Authorization": f"Bearer {api_key}"},
            json=payload,
            timeout=30.0,
        )
        response.raise_for_status()
        content = response.json()["choices"][0]["message"]["content"]
        parsed = json.loads(content)
        if "summary" in parsed and "subgoals" in parsed and "needed_connections" in parsed:
            return parsed, "openai"
    except (httpx.HTTPError, KeyError, json.JSONDecodeError, IndexError):
        return None, "heuristic"
    return None, "heuristic"


def _heuristic_plan(text: str) -> dict:
    lowered = text.lower()
    domain = "this goal"
    if "robot" in lowered:
        domain = "robotics research"
    elif "ai" in lowered or "machine learning" in lowered:
        domain = "AI research"
    elif re.search(r"job|role|position|internship", lowered):
        domain = "that role"

    place = "your target community"
    if "berkeley" in lowered:
        place = "Berkeley"

    return {
        "summary": f"Find the people and labs in {place} who can help with {domain}.",
        "subgoals": [
            {
                "text": f"Name the labs and groups in {place} that actually do this work.",
                "why": "You cannot get a useful intro until you know where the work lives.",
            },
            {
                "text": "Find a current student or lab manager who can explain how people join.",
                "why": "Peers and operators know which doors are actually open.",
            },
            {
                "text": "Get one faculty or alumni conversation, not a cold mass outreach.",
                "why": "A single warm path beats broadcasting to everyone you know.",
            },
            {
                "text": "Turn that conversation into a next action: reading group, office hours, or application.",
                "why": "The agent should end in a move, not a longer contact list.",
            },
        ],
        "needed_connections": [
            {
                "kind": "faculty advisor",
                "query": f"{domain} faculty {place}",
                "why": "They set research direction and can host or recommend you.",
            },
            {
                "kind": "current student",
                "query": f"{domain} PhD student {place}",
                "why": "They know how people actually get into the lab.",
            },
            {
                "kind": "lab manager",
                "query": f"{place} lab community manager",
                "why": "They make introductions to reading groups and office hours.",
            },
            {
                "kind": "alumni",
                "query": f"{place} alumni {domain}",
                "why": "They can introduce you inward without you being a cold email.",
            },
        ],
    }
