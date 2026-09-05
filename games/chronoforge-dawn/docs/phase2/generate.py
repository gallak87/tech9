#!/usr/bin/env python3
import sys
sys.path.insert(0, './hy3dshape')
sys.path.insert(0, './hy3dpaint')

from pathlib import Path
import argparse
from hy3dshape.pipeline_mlx import ShapePipeline
from textureGenPipeline_mlx import Hunyuan3DPaintConfigMLX, Hunyuan3DPaintPipelineMLX

def main():
    parser = argparse.ArgumentParser(description="Hunyuan3D-2.1 MLX Generation Pipeline")
    parser.add_argument("--image", type=str, required=True, help="Path to input reference image")
    parser.add_argument("--precision", type=str, default="fp16", choices=["fp16", "int8", "int4"], help="Model precision variant")
    parser.add_argument("--views", type=int, default=6, help="Number of views for texture generation")
    parser.add_argument("--texture-size", type=int, default=512, help="Resolution per view for texture baking")
    parser.add_argument("--output", type=str, default="output.glb", help="Path to save output textured GLB mesh")
    
    args = parser.parse_args()

    input_image = Path(args.image).resolve()
    output_path = Path(args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    temp_mesh = output_path.with_name(output_path.stem + "_temp_shape.glb")

    print(f"[*] Starting Stage 1: Shape Generation using {input_image}...")
    shape_pipe = ShapePipeline.from_pretrained("dgrauet/hunyuan3d-2.1-mlx")
    mesh = shape_pipe(
        str(input_image), 
        num_inference_steps=50, 
        guidance_scale=7.5, 
        octree_resolution=256
    )
    mesh.export(str(temp_mesh))
    print(f"[+] Stage 1 complete. Intermediate shape saved to {temp_mesh}")

    print(f"[*] Starting Stage 2: PBR Texture Synthesis ({args.views} views, {args.texture_size}px)...")
    paint_cfg = Hunyuan3DPaintConfigMLX(
        max_num_view=args.views, 
        resolution=args.texture_size
    )
    paint_pipe = Hunyuan3DPaintPipelineMLX(paint_cfg)
    paint_pipe(
        mesh_path=str(temp_mesh),
        image_path=str(input_image),
        output_mesh_path=str(output_path),
        save_glb=True
    )
    
    if temp_mesh.exists():
        temp_mesh.unlink()

    print(f"[+] Pipeline complete! Textured model successfully written to {output_path}")

if __name__ == "__main__":
    main()
