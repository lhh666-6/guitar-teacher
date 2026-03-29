"""Audio chord recognition package.

Implemented up to Phase 3:
- microphone stream input
- preprocessing/chroma features
- template classification and temporal smoothing
"""

from .stream_input import (  # noqa: F401
	AudioDependencyError,
	FrameStats,
	MicStreamInput,
	RingAudioBuffer,
	build_frame_stats,
	compute_peak,
	compute_rms,
)
from .features import (  # noqa: F401
	FeatureDependencyError,
	FeatureResult,
	extract_chroma_features,
)
from .chord_templates import ChordTemplate, build_templates  # noqa: F401
from .classifier import ChordPrediction, classify_chord  # noqa: F401
from .smoother import ChordTemporalSmoother, SmoothedOutput  # noqa: F401
