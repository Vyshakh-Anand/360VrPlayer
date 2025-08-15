// Simple sharpening shader for Three.js postprocessing
const SharpenShader = {
  uniforms: {
    "tDiffuse": { value: null },
    "resolution": { value: new THREE.Vector2(1, 1) },
    "strength": { value: 0.5 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 resolution;
    uniform float strength;
    varying vec2 vUv;
    void main() {
      vec2 texel = 1.0 / resolution;
      mat3 kernel = mat3(
        0, -1, 0,
        -1, 5, -1,
        0, -1, 0
      );
      vec3 color = vec3(0.0);
      for(int x = -1; x <= 1; x++) {
        for(int y = -1; y <= 1; y++) {
          vec2 offset = vec2(float(x), float(y)) * texel;
          color += texture2D(tDiffuse, vUv + offset).rgb * kernel[y+1][x+1];
        }
      }
      gl_FragColor = vec4(mix(texture2D(tDiffuse, vUv).rgb, color, strength), 1.0);
    }
  `
};
export { SharpenShader };