"""Step 3: same contacts, different graph view per goal.

Hook for teammates. Read GoalPlan from the Goal → Network agent, then filter
or regroup the map. Do not put this logic in knowledge_graph.py.
"""


def build_goal_view(db, goal_id: str):
    raise NotImplementedError("Owned by teammates: dynamic graph based on goal (step 3).")
