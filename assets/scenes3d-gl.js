/* ===========================================================================
   Basic Mathematics — the Three.js painter for the 3D scenes
   Loaded by assets/scenes3d.js only after Three.js has arrived (BM3D.THREE, the
   namespace src/vendor/three.js exports, handed in as THREE) and a stage
   is near the viewport. It paints the same screen primitives as the SVG painter
   (points already projected by BM3D.Cam to viewBox x, y plus a world depth), so
   GL pixels, overlay labels and handles always agree; WebGL adds true depth
   testing, antialiasing and per-vertex shading on spheres.

   One WebGLRenderer per page, on a detached canvas. Each stage keeps its own
   Scene and camera with two merged meshes (opaque, and translucent sorted back
   to front); after a render the picture is copied into the stage's own 2D
   canvas. Rendering happens on demand only (stage.invalidate()), never in a loop.

     BM3D.initGL(THREE, hooks) → { renderer, lost, render(stage), drop(stage) } or null
       hooks.lost()      the context was lost: scenes3d.js puts every stage back on SVG
       hooks.restored()  it came back: stages that were 3D switch back
   =========================================================================== */
(function () {
  "use strict";
  var BM3D = window.BM3D = window.BM3D || {};

  BM3D.initGL = function (THREE, hooks) {
    if (!THREE || !THREE.WebGLRenderer) return null;
    hooks = hooks || {};
    /* token colours go in and come out unchanged, so GL matches the SVG exactly */
    if (THREE.ColorManagement) THREE.ColorManagement.enabled = false;
    var canvas = document.createElement("canvas");
    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: "low-power" });
    } catch (e) {
      return null;
    }
    if (!renderer.getContext()) return null;
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.setPixelRatio(1);
    renderer.setClearColor(new THREE.Color(0, 0, 0), 0);
    var size = { w: 0, h: 0 };
    var mats = materials();
    var attached = [];

    function materials() {
      return {
        solid: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
        glass: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, depthWrite: false })
      };
    }

    var mgr = { renderer: renderer, lost: false, render: render, drop: drop };

    canvas.addEventListener("webglcontextlost", function (e) {
      e.preventDefault();
      mgr.lost = true;
      if (hooks.lost) hooks.lost();
    }, false);
    canvas.addEventListener("webglcontextrestored", function () {
      /* three re-initialises its own state; rebuild everything that lived on the GPU */
      attached.slice().forEach(drop);
      mats.solid.dispose(); mats.glass.dispose();
      mats = materials();
      size = { w: 0, h: 0 };
      mgr.lost = false;
      if (hooks.restored) hooks.restored();
    }, false);

    function attach(st) {
      var scene = new THREE.Scene();
      var cam = new THREE.OrthographicCamera(0, 1, 0, -1, 0.01, 10);
      cam.matrixAutoUpdate = false;
      cam.matrix.identity();
      cam.updateMatrixWorld(true);
      function mesh(mat) {
        var m = new THREE.Mesh(new THREE.BufferGeometry(), mat);
        m.matrixAutoUpdate = false;
        m.frustumCulled = false;
        scene.add(m);
        return m;
      }
      var d = { scene: scene, cam: cam, solid: mesh(mats.solid), glass: mesh(mats.glass) };
      d.glass.renderOrder = 1;
      st.__gl = d;
      attached.push(st);
      return d;
    }
    function drop(st) {
      var d = st.__gl;
      if (!d) return;
      d.solid.geometry.dispose();
      d.glass.geometry.dispose();
      st.__gl = null;
      var i = attached.indexOf(st);
      if (i >= 0) attached.splice(i, 1);
    }

    /* ---------------------------------------------- primitives → triangles -- */
    function build(st) {
      var D = st.cam.radius * 10, edge = st.cam.radius * 0.004;
      var cam = st.cam, L = st.light || BM3D.LIGHT;
      var sp = [], sc = [], tris = [];
      function rgba(rgb, f, a) {
        var c = rgb || [128, 128, 128];
        return [Math.min(1, c[0] * f / 255), Math.min(1, c[1] * f / 255), Math.min(1, c[2] * f / 255), a];
      }
      /* p: [x, y, depth] in viewBox units → view space (y up, z toward the viewer) */
      /* one colour for the triangle, or one per corner (c1, c2) for smooth shading */
      function tri(p0, p1, p2, c, c1, c2) {
        var v = [p0[0], -p0[1], p0[2] - D, p1[0], -p1[1], p1[2] - D, p2[0], -p2[1], p2[2] - D];
        var cs = [c, c1 || c, c2 || c];
        if (c[3] >= 1) {
          for (var i = 0; i < 9; i++) sp.push(v[i]);
          cs.forEach(function (q) { sc.push(q[0], q[1], q[2]); });
        } else {
          tris.push({ v: v, c: cs, z: (p0[2] + p1[2] + p2[2]) / 3 });
        }
      }
      function cap(x, y, z, r, c) {
        var n = r > 3 ? 10 : 6;
        for (var i = 0; i < n; i++) {
          var a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
          tri([x, y, z], [x + Math.cos(a0) * r, y + Math.sin(a0) * r, z], [x + Math.cos(a1) * r, y + Math.sin(a1) * r, z], c);
        }
      }
      function ribbon(a, b, w, c, bias) {
        var dx = b[0] - a[0], dy = b[1] - a[1], len = Math.sqrt(dx * dx + dy * dy), hw = w / 2;
        var za = a[2] + bias, zb = b[2] + bias;
        if (len > 1e-6) {
          var nx = -dy / len * hw, ny = dx / len * hw;
          var p0 = [a[0] + nx, a[1] + ny, za], p1 = [b[0] + nx, b[1] + ny, zb];
          var p2 = [b[0] - nx, b[1] - ny, zb], p3 = [a[0] - nx, a[1] - ny, za];
          tri(p0, p1, p2, c);
          tri(p0, p2, p3, c);
        }
        cap(a[0], a[1], za, hw, c);
        cap(b[0], b[1], zb, hw, c);
      }
      function line(a, b, w, dash, c, bias, off) {
        if (!dash) { ribbon(a, b, w, c, bias); return; }
        var dx = b[0] - a[0], dy = b[1] - a[1], len = Math.sqrt(dx * dx + dy * dy);
        for (var s0 = -(off || 0); s0 < len; s0 += dash[0] + dash[1]) {
          var s1 = Math.min(len, s0 + dash[0]);
          if (s1 <= 0) continue;
          var t0 = Math.max(0, s0) / len, t1 = s1 / len;
          ribbon([a[0] + dx * t0, a[1] + dy * t0, a[2] + (b[2] - a[2]) * t0],
            [a[0] + dx * t1, a[1] + dy * t1, a[2] + (b[2] - a[2]) * t1], w, c, bias);
        }
      }
      function ball(p) {
        /* enough facets that the outline stays round at any size: about 8 viewBox px each */
        var NM = Math.max(20, Math.min(64, Math.round(2 * Math.PI * p.R / 8))), NL = Math.ceil(NM / 2), rows = [];
        for (var i = 0; i <= NL; i++) {
          var row = [], th = (i / NL) * Math.PI;
          for (var j = 0; j <= NM; j++) {
            var ph = (j / NM) * Math.PI * 2;
            var cx = Math.sin(th) * Math.cos(ph), cy = Math.cos(th), cz = Math.sin(th) * Math.sin(ph);
            var nw = [cx * cam.right[0] + cy * cam.up[0] + cz * cam.e[0],
              cx * cam.right[1] + cy * cam.up[1] + cz * cam.e[1],
              cx * cam.right[2] + cy * cam.up[2] + cz * cam.e[2]];
            var f = 0.62 + 0.38 * Math.abs(nw[0] * L[0] + nw[1] * L[1] + nw[2] * L[2]);
            row.push({ p: [p.c[0] + cx * p.R, p.c[1] - cy * p.R, p.c[2] + cz * p.rw], c: rgba(p.rgb, f, p.a2) });
          }
          rows.push(row);
        }
        for (i = 0; i < NL; i++) {
          for (j = 0; j < NM; j++) {
            var q0 = rows[i][j], q1 = rows[i][j + 1], q2 = rows[i + 1][j + 1], q3 = rows[i + 1][j];
            tri(q0.p, q1.p, q2.p, q0.c, q1.c, q2.c);
            tri(q0.p, q2.p, q3.p, q0.c, q2.c, q3.c);
          }
        }
      }
      st.prims.forEach(function (p) {
        if (p.t === "poly") {
          var c = rgba(p.rgb, 1, p.a2);
          for (var i = 1; i + 1 < p.p.length; i++) tri(p.p[0], p.p[i], p.p[i + 1], c);
          if (p.stroke) {
            var sc2 = rgba(p.stroke.rgb, 1, 1);
            p.p.forEach(function (q, k) { line(q, p.p[(k + 1) % p.p.length], p.stroke.w, null, sc2, edge); });
          }
        } else if (p.t === "tri") {
          var zb = p.zb || edge;
          tri([p.p[0][0], p.p[0][1], p.p[0][2] + zb], [p.p[1][0], p.p[1][1], p.p[1][2] + zb],
            [p.p[2][0], p.p[2][1], p.p[2][2] + zb], rgba(p.rgb, 1, p.a2));
        } else if (p.t === "line") {
          line(p.a, p.b, p.w, p.dash, rgba(p.rgb, 1, p.a2), p.zb || edge, p.off);
        } else if (p.t === "ball") {
          ball(p);
        }
      });
      tris.sort(function (a, b) { return a.z - b.z; });
      var gp = new Float32Array(tris.length * 9), gc = new Float32Array(tris.length * 12);
      tris.forEach(function (t, i) {
        for (var k = 0; k < 9; k++) gp[i * 9 + k] = t.v[k];
        for (k = 0; k < 3; k++) {
          var q = t.c[k];
          gc[i * 12 + k * 4] = q[0]; gc[i * 12 + k * 4 + 1] = q[1];
          gc[i * 12 + k * 4 + 2] = q[2]; gc[i * 12 + k * 4 + 3] = q[3];
        }
      });
      return { sp: new Float32Array(sp), sc: new Float32Array(sc), gp: gp, gc: gc, D: D };
    }
    function geometry(pos, col, n) {
      var g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("color", new THREE.BufferAttribute(col, n));
      return g;
    }

    function render(st) {
      if (mgr.lost || !st.backW || !st.backH) return;
      var ctx3 = renderer.getContext();
      if (ctx3 && ctx3.isContextLost && ctx3.isContextLost()) return;
      var d = st.__gl || attach(st);
      var b = build(st);
      d.solid.geometry.dispose();
      d.solid.geometry = geometry(b.sp, b.sc, 3);
      d.glass.geometry.dispose();
      d.glass.geometry = geometry(b.gp, b.gc, 4);
      var f = st.frame;
      d.cam.left = f.left; d.cam.right = f.right; d.cam.top = -f.top; d.cam.bottom = -f.bottom;
      d.cam.near = 0.01; d.cam.far = b.D * 2;
      d.cam.updateProjectionMatrix();
      if (size.w !== st.backW || size.h !== st.backH) {
        renderer.setSize(st.backW, st.backH, false);
        size = { w: st.backW, h: st.backH };
      }
      renderer.render(d.scene, d.cam);
      var c2 = st.canvas;
      if (c2.width !== st.backW) c2.width = st.backW;
      if (c2.height !== st.backH) c2.height = st.backH;
      var ctx = st.ctx2 || (st.ctx2 = c2.getContext("2d"));
      if (!ctx) throw new Error("no 2D context for the stage canvas");
      ctx.clearRect(0, 0, c2.width, c2.height);
      ctx.drawImage(canvas, 0, 0, st.backW, st.backH, 0, 0, c2.width, c2.height);
    }

    return mgr;
  };
})();
