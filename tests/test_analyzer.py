import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import numpy as np

from facial.analyzer import FaceAnalyzer, _AGE_INPUT_SIZE
from facial.detector import FaceBox


class FaceAnalyzerTests(unittest.TestCase):
    def test_age_estimation_uses_face_and_empty_body_inputs(self):
        analyzer = FaceAnalyzer()
        model = Mock()
        model.run.return_value = [np.array([[34.6]], dtype=np.float32)]
        analyzer._age_session = model
        analyzer._age_input = "faces_bodies"
        analyzer._age_output = "age"
        analyzer._age_body = np.full(
            (3, _AGE_INPUT_SIZE, _AGE_INPUT_SIZE), -1.0, dtype=np.float32
        )

        age = analyzer._estimate_age(
            np.full((120, 80, 3), 128, dtype=np.uint8)
        )

        self.assertAlmostEqual(age, 34.6, places=4)
        model_input = model.run.call_args.args[1]["faces_bodies"]
        self.assertEqual(model_input.shape, (1, 6, _AGE_INPUT_SIZE, _AGE_INPUT_SIZE))
        np.testing.assert_array_equal(model_input[0, 3:], analyzer._age_body)
        self.assertTrue(np.isfinite(model_input).all())

    def test_mivolo_age_is_used_without_requesting_deepface_age(self):
        analyzer = FaceAnalyzer()
        emotion_model = SimpleNamespace(
            analyze=Mock(
                return_value={
                    "dominant_emotion": "sad",
                    "emotion": {"happy": 8.0, "sad": 82.0, "neutral": 10.0},
                }
            )
        )
        age_model = Mock()
        age_model.run.return_value = [np.array([[41.2]], dtype=np.float32)]
        analyzer._deepface = emotion_model
        analyzer._age_backend = "mivolo"
        analyzer._age_session = age_model
        analyzer._age_input = "faces_bodies"
        analyzer._age_output = "age"
        analyzer._age_body = np.zeros(
            (3, _AGE_INPUT_SIZE, _AGE_INPUT_SIZE), dtype=np.float32
        )

        with patch.object(analyzer, "_load_models"):
            result = analyzer.analyze_faces(
                np.zeros((120, 120, 3), dtype=np.uint8),
                [FaceBox(20, 20, 60, 60)],
            )[0]

        self.assertEqual(result["age"], 41)
        self.assertEqual(result["emotion_key"], "sad")
        self.assertEqual(
            emotion_model.analyze.call_args.kwargs["actions"], ("emotion",)
        )


if __name__ == "__main__":
    unittest.main()
