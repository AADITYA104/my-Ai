---
name: openscad-parametric-cad
description: "Generate precise, parametric 3D models and CAD geometry as OpenSCAD (.scad) script code using Constructive Solid Geometry (CSG) - unions, differences, intersections, extrusions, and modules - for 3D printing, mechanical parts, enclosures, and programmatic solid modeling."
category: generative_3d_modeling
---

### OpenSCAD: Script-Based Parametric CAD Engine
OpenSCAD is a programmatic 3D CAD modeler where solids are described entirely in code (no manual mesh editing), making it ideal for precise, parametric, reproducible mechanical parts, enclosures, brackets, and 3D-printable objects.

**Core modeling approach - Constructive Solid Geometry (CSG):**
- Primitives: `cube([x,y,z])`, `sphere(r=)`, `cylinder(h=,r=)`, `polyhedron()`.
- Boolean ops: `union()`, `difference()`, `intersection()` combine primitives into complex shapes.
- Transforms: `translate()`, `rotate()`, `scale()`, `mirror()` position/orient parts.
- 2D-to-3D: `linear_extrude()` and `rotate_extrude()` turn 2D profiles (`circle()`, `square()`, `polygon()`) into solids.
- Repetition/logic: `for()` loops, `module`/`function` definitions, and variables make designs parametric (a single script can generate a family of parts by changing a few top-level variables).

**Workflow for generating a model:**
1. Define top-level parameters (dimensions, tolerances, counts) as variables at the top of the file so the design is easily tunable.
2. Build shapes bottom-up with modules for reusable sub-parts.
3. Combine with `difference()`/`union()` to cut holes, add fillets/chamfers, or merge components.
4. Use `$fn` (or `$fa`/`$fs`) to control circle/cylinder smoothness for curved geometry.
5. Output is rendered/exported to STL/OFF/3MF for 3D printing or downstream CAD/CAM.

**Reference material bundled alongside this skill** (full OpenSCAD project, kept for deep lookups):
- `external-skills/openscad/examples/` - official example `.scad` files covering CSG, extrusions, modules, functions, and text.
- `external-skills/openscad/libraries/` - reusable library modules (e.g. MCAD).
- `external-skills/openscad/doc/` - language/user documentation.
- `external-skills/openscad/src/` - the OpenSCAD application's own C++ source (parser, geometry kernel, renderer), useful if asked about how OpenSCAD itself evaluates or renders CSG trees.

**When to use this skill:** any request to design a 3D-printable part, mechanical bracket/enclosure, parametric object family, or CAD geometry described in code rather than a mesh/sculpting tool.
