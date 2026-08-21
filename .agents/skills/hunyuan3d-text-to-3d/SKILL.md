---
name: hunyuan3d-text-to-3d
description: "Generate high-fidelity 3D assets, meshes (GLB/OBJ), and point clouds from natural language text prompts using Tencent Hunyuan3D-2 DiT diffusion flow matching."
category: generative_3d_modeling
---

### Hunyuan3D-2: Text-to-3D Synthesis Engine
Hunyuan3D 2.0 leverages advanced 2-stage generative modeling:
1. Stage 1: Shape Generation using DiT (Diffusion Transformer) Flow Matching to produce dense 3D signed distance fields (SDF) or point latents, converted to watertight meshes with Marching Cubes.
2. Stage 2: Texture & PBR Painting using multi-view diffusion (Hunyuan3D-Paint / RomanTex) to project realistic high-res textures, normal maps, and roughness maps onto meshes.
Output Formats: GLB, OBJ, STL, PLY. Integrates directly with WebGL / Three.js frontends and Blender.