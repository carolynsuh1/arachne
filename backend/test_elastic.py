import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import Organization, Person
from app.pipeline.elastic import index_network, search


class ElasticPipelineTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://")
        Base.metadata.create_all(engine)
        self.session = sessionmaker(bind=engine)()
        self.session.add_all([
            Person(id="p-maya", name="Maya Patel", bio="Robotics researcher", interests='["prosthetics"]', skills='["Python"]'),
            Organization(id="o-lab", name="Mobility Lab", type="lab", description="Assistive technology"),
        ])
        self.session.commit()

    def tearDown(self):
        self.session.close()

    @patch("app.pipeline.elastic._clients")
    def test_index_network_rebuilds_entity_index(self, clients):
        elastic, openai = Mock(), Mock()
        elastic.indices.exists.return_value = True
        elastic.bulk.return_value = {"errors": False}
        openai.embeddings.create.return_value = SimpleNamespace(data=[SimpleNamespace(embedding=[0.1] * 1536), SimpleNamespace(embedding=[0.2] * 1536)])
        clients.return_value = (elastic, openai)
        self.assertEqual(index_network(self.session), {"index": "yourweb-entities", "indexed": 2})
        elastic.indices.delete.assert_called_once_with(index="yourweb-entities")
        documents = elastic.bulk.call_args.kwargs["operations"][1::2]
        self.assertEqual(documents[0]["type"], "person")
        self.assertIn("Interests: prosthetics", documents[0]["search_text"])
        self.assertEqual(documents[1]["type"], "organization")

    @patch("app.pipeline.elastic._clients")
    def test_search_returns_ranked_minimal_shape(self, clients):
        elastic, openai = Mock(), Mock()
        openai.embeddings.create.return_value = SimpleNamespace(data=[SimpleNamespace(embedding=[0.1] * 1536)])
        elastic.search.return_value = {"hits": {"hits": [{"_score": 0.42, "_source": {"entity_id": "p-maya", "name": "Maya Patel", "type": "person"}}]}}
        clients.return_value = (elastic, openai)
        self.assertEqual(search("prosthetics"), [{"entity_id": "p-maya", "name": "Maya Patel", "type": "person", "score": 0.42}])
        self.assertIn("rrf", elastic.search.call_args.kwargs["body"]["retriever"])

    def test_blank_query_does_not_call_external_services(self):
        self.assertEqual(search("  "), [])


if __name__ == "__main__":
    unittest.main()
