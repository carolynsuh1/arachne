import os
import json
import sys
from dotenv import load_dotenv
from anthropic import Anthropic

load_dotenv()

client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

with open("schema.json", "r") as f:
    schema = json.load(f)


def extract(doc_path):
    with open(doc_path, "r") as f:
        doc_text = f.read()

    system_prompt = f"""You are an entity extraction system. Given raw unstructured text, extract entities and relationships matching this exact schema:

{json.dumps(schema, indent=2)}

Rules:
- Only extract entities that are actually mentioned in the text, do not invent anything
- For Person entities, include all fields you can infer, leave fields blank ("") if not mentioned
- source_doc should be set to the filename I give you
- relationships should reference entities by name (matching the "name" field of the entity)
- Return ONLY valid JSON, no preamble, no markdown code fences, no explanation
- The JSON should have two top-level keys: "entities" (an object with arrays for each entity type found) and "relationships" (an array of {{"type": ..., "from": ..., "to": ...}} objects)
"""

    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=4000,
        system=system_prompt,
        messages=[
            {"role": "user", "content": f"Filename: {doc_path}\n\nText:\n{doc_text}"}
        ],
    )

    raw_output = message.content[0].text.strip()

    if raw_output.startswith("```"):
        raw_output = raw_output.split("```")[1]
        if raw_output.startswith("json"):
            raw_output = raw_output[4:]
        raw_output = raw_output.strip()

    try:
        result = json.loads(raw_output)
    except json.JSONDecodeError:
        print("Model didn't return clean JSON, raw output was:")
        print(raw_output)
        return None

    return result


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 extract.py <path_to_doc>")
        sys.exit(1)

    doc_path = sys.argv[1]
    result = extract(doc_path)

    if result:
        output_path = doc_path.rsplit(".", 1)[0] + "_extracted.json"
        with open(output_path, "w") as f:
            json.dump(result, f, indent=2)
        print(f"Extracted data saved to {output_path}")
        print(json.dumps(result, indent=2))
