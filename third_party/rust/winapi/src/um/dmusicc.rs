// Licensed under the Apache License, Version 2.0
// <LICENSE-APACHE or http://www.apache.org/licenses/LICENSE-2.0> or the MIT license
// <LICENSE-MIT or http://opensource.org/licenses/MIT>, at your option.
// All files in the project carrying such notice may not be copied, modified, or distributed
// except according to those terms.
DEFINE_GUID!{CLSID_DirectMusic,
    0x636b9f10, 0x0c7d, 0x11d1, 0x95, 0xb2, 0x00, 0x20, 0xaf, 0xdc, 0x74, 0x21}
DEFINE_GUID!{CLSID_DirectMusicCollection,
    0x480ff4b0, 0x28b2, 0x11d1, 0xbe, 0xf7, 0x00, 0xc0, 0x4f, 0xbf, 0x8f, 0xef}
DEFINE_GUID!{CLSID_DirectMusicSynth,
    0x58c2b4d0, 0x46e7, 0x11d1, 0x89, 0xac, 0x00, 0xa0, 0xc9, 0x05, 0x41, 0x29}
DEFINE_GUID!{IID_IDirectMusic,
    0x6536115a, 0x7b2d, 0x11d2, 0xba, 0x18, 0x00, 0x00, 0xf8, 0x75, 0xac, 0x12}
DEFINE_GUID!{IID_IDirectMusicBuffer,
    0xd2ac2878, 0xb39b, 0x11d1, 0x87, 0x04, 0x00, 0x60, 0x08, 0x93, 0xb1, 0xbd}
DEFINE_GUID!{IID_IDirectMusicPort,
    0x08f2d8c9, 0x37c2, 0x11d2, 0xb9, 0xf9, 0x00, 0x00, 0xf8, 0x75, 0xac, 0x12}
DEFINE_GUID!{IID_IDirectMusicThru,
    0xced153e7, 0x3606, 0x11d2, 0xb9, 0xf9, 0x00, 0x00, 0xf8, 0x75, 0xac, 0x12}
DEFINE_GUID!{IID_IDirectMusicPortDownload,
    0xd2ac287a, 0xb39b, 0x11d1, 0x87, 0x04, 0x00, 0x60, 0x08, 0x93, 0xb1, 0xbd}
DEFINE_GUID!{IID_IDirectMusicDownload,
    0xd2ac287b, 0xb39b, 0x11d1, 0x87, 0x04, 0x00, 0x60, 0x08, 0x93, 0xb1, 0xbd}
DEFINE_GUID!{IID_IDirectMusicCollection,
    0xd2ac287c, 0xb39b, 0x11d1, 0x87, 0x04, 0x00, 0x60, 0x08, 0x93, 0xb1, 0xbd}
DEFINE_GUID!{IID_IDirectMusicInstrument,
    0xd2ac287d, 0xb39b, 0x11d1, 0x87, 0x04, 0x00, 0x60, 0x08, 0x93, 0xb1, 0xbd}
DEFINE_GUID!{IID_IDirectMusicDownloadedInstrument,
    0xd2ac287e, 0xb39b, 0x11d1, 0x87, 0x04, 0x00, 0x60, 0x08, 0x93, 0xb1, 0xbd}
DEFINE_GUID!{IID_IDirectMusic2,
    0x6fc2cae1, 0xbc78, 0x11d2, 0xaf, 0xa6, 0x00, 0xaa, 0x00, 0x24, 0xd8, 0xb6}
DEFINE_GUID!{IID_IDirectMusic8,
    0x2d3629f7, 0x813d, 0x4939, 0x85, 0x08, 0xf0, 0x5c, 0x6b, 0x75, 0xfd, 0x97}
DEFINE_GUID!{GUID_DMUS_PROP_GM_Hardware,
    0x178f2f24, 0xc364, 0x11d1, 0xa7, 0x60, 0x00, 0x00, 0xf8, 0x75, 0xac, 0x12}
DEFINE_GUID!{GUID_DMUS_PROP_GS_Hardware,
    0x178f2f25, 0xc364, 0x11d1, 0xa7, 0x60, 0x00, 0x00, 0xf8, 0x75, 0xac, 0x12}
DEFINE_GUID!{GUID_DMUS_PROP_XG_Hardware,
    0x178f2f26, 0xc364, 0x11d1, 0xa7, 0x60, 0x00, 0x00, 0xf8, 0x75, 0xac, 0x12}
DEFINE_GUID!{GUID_DMUS_PROP_XG_Capable,
    0x6496aba1, 0x61b0, 0x11d2, 0xaf, 0xa6, 0x00, 0xaa, 0x00, 0x24, 0xd8, 0xb6}
DEFINE_GUID!{GUID_DMUS_PROP_GS_Capable,
    0x6496aba2, 0x61b0, 0x11d2, 0xaf, 0xa6, 0x00, 0xaa, 0x00, 0x24, 0xd8, 0xb6}
DEFINE_GUID!{GUID_DMUS_PROP_DLS1,
    0x178f2f27, 0xc364, 0x11d1, 0xa7, 0x60, 0x00, 0x00, 0xf8, 0x75, 0xac, 0x12}
DEFINE_GUID!{GUID_DMUS_PROP_DLS2,
    0xf14599e5, 0x4689, 0x11d2, 0xaf, 0xa6, 0x00, 0xaa, 0x00, 0x24, 0xd8, 0xb6}
DEFINE_GUID!{GUID_DMUS_PROP_INSTRUMENT2,
    0x865fd372, 0x9f67, 0x11d2, 0x87, 0x2a, 0x00, 0x60, 0x08, 0x93, 0xb1, 0xbd}
DEFINE_GUID!{GUID_DMUS_PROP_SynthSink_DSOUND,
    0x0aa97844, 0xc877, 0x11d1, 0x87, 0x0c, 0x00, 0x60, 0x08, 0x93, 0xb1, 0xbd}
DEFINE_GUID!{GUID_DMUS_PROP_SynthSink_WAVE,
    0x0aa97845, 0xc877, 0x11d1, 0x87, 0x0c, 0x00, 0x60, 0x08, 0x93, 0xb1, 0xbd}
DEFINE_GUID!{GUID_DMUS_PROP_SampleMemorySize,
    0x178f2f28, 0xc364, 0x11d1, 0xa7, 0x60, 0x00, 0x00, 0xf8, 0x75, 0xac, 0x12}
DEFINE_GUID!{GUID_DMUS_PROP_SamplePlaybackRate,
    0x2a91f713, 0xa4bf, 0x11d2, 0xbb, 0xdf, 0x00, 0x60, 0x08, 0x33, 0xdb, 0xd8}
DEFINE_GUID!{GUID_DMUS_PROP_WriteLatency,
    0x268a0fa0, 0x60f2, 0x11d2, 0xaf, 0xa6, 0x00, 0xaa, 0x00, 0x24, 0xd8, 0xb6}
DEFINE_GUID!{GUID_DMUS_PROP_WritePeriod,
    0x268a0fa1, 0x60f2, 0x11d2, 0xaf, 0xa6, 0x00, 0xaa, 0x00, 0x24, 0xd8, 0xb6}
DEFINE_GUID!{GUID_DMUS_PROP_MemorySize,
    0x178f2f28, 0xc364, 0x11d1, 0xa7, 0x60, 0x00, 0x00, 0xf8, 0x75, 0xac, 0x12}
DEFINE_GUID!{GUID_DMUS_PROP_WavesReverb,
    0x04cb5622, 0x32e5, 0x11d2, 0xaf, 0xa6, 0x00, 0xaa, 0x00, 0x24, 0xd8, 0xb6}
DEFINE_GUID!{GUID_DMUS_PROP_Effects,
    0xcda8d611, 0x684a, 0x11d2, 0x87, 0x1e, 0x00, 0x60, 0x08, 0x93, 0xb1, 0xbd}
DEFINE_GUID!{GUID_DMUS_PROP_LegacyCaps,
    0xcfa7cdc2, 0x00a1, 0x11d2, 0xaa, 0xd5, 0x00, 0x00, 0xf8, 0x75, 0xac, 0x12}
DEFINE_GUID!{GUID_DMUS_PROP_Volume,
    0xfedfae25, 0xe46e, 0x11d1, 0xaa, 0xce, 0x00, 0x00, 0xf8, 0x75, 0xac, 0x12}
