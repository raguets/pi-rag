import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("ingest", Path(__file__).parents[2] / "scripts" / "ingest_qdrant.py")
ingest = importlib.util.module_from_spec(SPEC); sys.modules["ingest"] = ingest; SPEC.loader.exec_module(ingest)

class UtilitiesTest(unittest.TestCase):
    def test_deterministic_ids(self):
        self.assertEqual(ingest.source_id("A\\b.pdf"), ingest.source_id("a/b.pdf"))
        value = ingest.chunk_identifier("s", "v", 1, "c")
        self.assertEqual(value, ingest.chunk_identifier("s", "v", 1, "c")); self.assertEqual(len(value), 64)
    def test_discovery(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); (root / "a.pdf").write_bytes(b"x"); (root / "~$a.docx").write_bytes(b"x"); (root / ".hidden.pdf").write_bytes(b"x"); (root / "b.exe").write_bytes(b"x")
            self.assertEqual([p.name for p in ingest.discover_files(root, True, ["*.pdf"], [], False)], ["a.pdf"])
    def test_csv_metadata_types(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); (root / "metadata.csv").write_text("source_path,year,active\na.pdf,2025,true\n", encoding="utf-8")
            self.assertEqual(ingest.load_metadata(root)["a.pdf"], {"year": 2025, "active": True})

if __name__ == "__main__": unittest.main()
