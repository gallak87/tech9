# Industrial assemblies

createIndustrialKit from @worldkit/environment/industrial provides original metre-scale press frames, factory bays, roller banks, drive wheels, ejector housings, channel cassettes, cooling fin banks, gantries, service towers and motor housings. Colossus Works is the first consumer. Assemblies contain shared bevelled structural geometry and procedural enamel/metal materials; no external maps or meshes are loaded.

The factory returns prototypes, materials, createAssembly(name) and idempotent dispose(). Prototype parts expose shared geometry and material; assemblies borrow those resources. Remove every placed assembly before disposing the kit. The caller owns placement, lights, collision policy and moving parts. The kit owns no textures, renderer, frame loop or clocks. It loads no external assets and can construct its geometry without a browser.
