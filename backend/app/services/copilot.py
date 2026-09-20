"""Graph-grounded copilot and coffee-chat rehearsal."""
import json, re
from collections import defaultdict
from sqlalchemy.orm import Session
from ..models import InteractionMemory, Organization, Person, PersonProfile, Relationship, ResearchBrief
from ..pipeline.deepgram import to_speakable_text
from ..pipeline.goal_view import _tokens

def build_copilot_turn(db: Session, question: str, history: list[dict], person_ids: list[str] | None = None) -> dict:
    """Answer a question from the graph. With `person_ids`, only those people are considered (a user's own map)."""
    people = db.query(Person).order_by(Person.name).all()
    if person_ids is not None:
        wanted = set(person_ids)
        people = [person for person in people if person.id in wanted]
    rels = db.query(Relationship).all()
    orgs = {o.id: o for o in db.query(Organization).all()}
    affiliations, memories = _affiliations(rels, orgs), _memories(db)
    terms = _tokens(" ".join([m.get("content", "") for m in history[-4:]] + [question]))
    selected = sorted(people, key=lambda p: (-_score(p, affiliations[p.id], memories[p.id], terms), p.name))[:3]
    lower = question.lower()
    if "why" in lower and ("instead" in lower or "over" in lower):
        selected = [p for p in people if p.name.split()[0].lower() in lower][:2] or selected
    if not selected:
        return _voice({"answer":"Your network is empty.","spoken_text":"Your network is empty.","cited_people":[],"highlight_events":[]})
    text, events, cited = "Here is how I would navigate your network. ", [], []
    elapsed = _duration(text)
    ids = {p.id for p in selected}
    edges = [r for r in rels if r.source_type == r.target_type == "person" and r.source_id in ids and r.target_id in ids]
    for index, person in enumerate(selected):
        names = [o.name for o in affiliations[person.id]]
        memory = memories[person.id][0].transcript if memories[person.id] else ""
        evidence = _evidence(person, names, memory, terms)
        sentence = f"{'Start with' if index == 0 else 'Next, consider'} {person.name}. {evidence} A natural opener is: {_starter(person, names, memory)} "
        events.append({"type":"node","node_id":f"person:{person.id}","at_ms":elapsed,"duration_ms":max(2200,_duration(sentence)),"note":evidence})
        text += sentence; elapsed += _duration(sentence)
        cited.append({"id":person.id,"node_id":f"person:{person.id}","name":person.name})
        edge = next((r for r in edges if r.source_id == person.id or r.target_id == person.id), None)
        if edge:
            source = next(p.name for p in selected if p.id == edge.source_id)
            target = next(p.name for p in selected if p.id == edge.target_id)
            sentence = f"The connection between {source} and {target} is supported by {edge.evidence.rstrip('.').lower()}. "
            events.append({"type":"edge","edge_id":edge.id,"source":f"person:{edge.source_id}","target":f"person:{edge.target_id}","at_ms":elapsed,"duration_ms":_duration(sentence),"note":edge.evidence})
            text += sentence; elapsed += _duration(sentence); edges.remove(edge)
    return _voice({"answer":text.strip(),"spoken_text":text.strip(),"cited_people":cited,"highlight_events":events})

def build_practice_turn(db: Session, person_id: str, message: str, history: list[dict]) -> dict | None:
    person = db.get(Person, person_id)
    if not person: return None
    context = person_context(db, person)
    if not history:
        reply = f"Hi, I’m {person.name}. I’ve been spending time on {context['focus']}. What brought you to this conversation?"
    elif any(w in message.lower() for w in ("project","work","research")):
        reply = f"What interests me most there is {context['focus']}. What have you tried so far, and where could your perspective add something?"
    else:
        reply = f"That connects with my interest in {context['focus']}. Can you tell me more about why it matters to you?"
    return _voice({"reply":reply,"spoken_text":reply,"person":context})

def build_feedback(db: Session, person_id: str, transcript: list[dict]) -> dict | None:
    person = db.get(Person, person_id)
    if not person: return None
    user_text = " ".join(m.get("content","") for m in transcript if m.get("role") == "user")
    topics = json.loads(person.interests or "[]") + json.loads(person.skills or "[]")
    shared = [topic for topic in topics if topic.lower() in user_text.lower()]
    topic = ", ".join(shared[:3]) or (topics[0] if topics else "their work")
    return {"topics_connected":f"You built rapport around {topic}.","missed_opportunity":"Tie your experience to a specific project and ask for their perspective.","suggested_follow_up":f"Send {person.name.split()[0]} a short note referencing {topic} and one takeaway.","next_action":"Draft the follow-up now, then schedule it within 24 hours."}

def person_context(db: Session, person: Person) -> dict:
    rels = db.query(Relationship).all(); orgs = {o.id:o for o in db.query(Organization).all()}
    profile = db.get(PersonProfile, person.id)
    memories = db.query(InteractionMemory).filter(InteractionMemory.person_id == person.id).order_by(InteractionMemory.happened_at.desc()).limit(5).all()
    brief = db.query(ResearchBrief).filter(ResearchBrief.person_id == person.id).order_by(ResearchBrief.created_at.desc()).first()
    interests, skills = json.loads(person.interests or "[]"), json.loads(person.skills or "[]")
    return {"id":person.id,"name":person.name,"kind":"person","bio":person.bio,"interests":interests,"skills":skills,"location":profile.location if profile else "","affiliations":[o.name for o in _affiliations(rels,orgs)[person.id]],"memories":[m.transcript for m in memories],"research":json.loads(brief.result_json) if brief else None,"focus":(interests+skills+[person.bio])[0] or "their work"}

def _voice(payload: dict) -> dict:
    spoken_text = payload.get("spoken_text")
    return {
        **payload,
        **({"spoken_text": to_speakable_text(spoken_text)} if spoken_text is not None else {}),
        "audio_base64": None,
        "audio_mime_type": None,
        "voice_status": "Use the continuous Deepgram session for spoken conversation.",
    }

def _affiliations(rels, orgs):
    result = defaultdict(list)
    for rel in rels:
        if rel.source_type=="person" and rel.target_type=="organization" and rel.target_id in orgs: result[rel.source_id].append(orgs[rel.target_id])
        elif rel.target_type=="person" and rel.source_type=="organization" and rel.source_id in orgs: result[rel.target_id].append(orgs[rel.source_id])
    return result

def _memories(db):
    result = defaultdict(list)
    for memory in db.query(InteractionMemory).order_by(InteractionMemory.happened_at.desc()).all():
        if memory.person_id: result[memory.person_id].append(memory)
    return result

def _score(person, orgs, memories, terms):
    document = " ".join([person.bio,person.interests,person.skills,person.university or "",*[o.name+" "+o.description for o in orgs],*[m.transcript for m in memories[:3]]]).lower()
    return sum(3 for term in terms if term in document)

def _evidence(person, orgs, memory, terms):
    topics = json.loads(person.interests or "[]")+json.loads(person.skills or "[]")
    matches = [x for x in topics if any(t in x.lower() for t in terms)]
    # People added by name and university have no bio yet; say what is actually known instead of an empty sentence.
    text = person.bio.rstrip(".") or (f"{person.name} is at {person.university}" if person.university else person.name)
    if matches: text += f", with relevant depth in {', '.join(matches[:2])}"
    if orgs: text += f" through {orgs[0]}"
    if memory: text += f". Your last interaction notes add context: {memory[:120].rstrip('.')}"
    return text+"."

def _starter(person, orgs, memory):
    topic = (json.loads(person.interests or "[]") or [person.bio or "your area"])[0]
    if memory: return f"“I’ve been thinking about our last conversation and your work on {topic}. Could I get your take on where to start?”"
    return f"“I’m exploring {topic}, and your experience{' at '+orgs[0] if orgs else ''} stood out. What should I learn first?”"

def _duration(text): return max(500,round(len(re.findall(r"\w+",text))/2.55*1000))
