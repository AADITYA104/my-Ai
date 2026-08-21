---
name: hunyuan3d-image-to-3d
description: "Transform single 2D images or multi-view photos into textured 3D geometric meshes with background removal and automatic topology reduction."
category: generative_3d_modeling
---

### Hunyuan3D-2: Image-to-3D Reconstruction Pipeline
Converts a single RGB image into a complete 3D textured mesh in <10 seconds:
- Pre-processing: Background removal via RemBG (BiRefNet / RMBG-1.4).
- Shape Synthesis: FlashVDM & Hunyuan3D-2mini Turbo flow matching for low-latency mesh extraction.
- Post-processing: Degenerate face removal, floater culling, mesh simplification (Quadric Error Metric), and fast UV unwrapping.
- PBR Baking: Generates diffuse, normal, and roughness maps ready for real-time game engines or web rendering.