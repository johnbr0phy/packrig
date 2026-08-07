/**
 * Radiance (.hdr / RGBE) decode, box-downsample and re-encode.
 *
 * Used by the two deploy builds to shrink the 2k HDRIs: they are only ever
 * PMREM'd into scene.environment to light the bike -- never drawn as a visible
 * background -- so a small equirect is indistinguishable from the 2k original.
 */
// ---------------------------------------------------------------- RGBE codec

/** Radiance .hdr -> { w, h, data: Float32Array(w*h*3) } */
function decodeHDR(buf) {
  let pos = 0;
  const line = () => {
    let s = '';
    while (pos < buf.length) {
      const c = buf[pos++];
      if (c === 10) break;
      s += String.fromCharCode(c);
    }
    return s;
  };
  if (!line().startsWith('#?')) throw new Error('not a radiance file');
  let l;
  while ((l = line()) !== '') {
    if (l.startsWith('FORMAT=') && !l.includes('32-bit_rle_rgbe')) throw new Error('unsupported FORMAT: ' + l);
  }
  const res = line().match(/^-Y\s+(\d+)\s+\+X\s+(\d+)$/);
  if (!res) throw new Error('unsupported resolution line');
  const h = +res[1], w = +res[2];

  const rgba = new Uint8Array(w * h * 4);
  let out = 0;
  const scan = new Uint8Array(w * 4);

  for (let y = 0; y < h; y++) {
    const b0 = buf[pos], b1 = buf[pos + 1], b2 = buf[pos + 2], b3 = buf[pos + 3];
    if (w < 8 || w > 0x7fff || b0 !== 2 || b1 !== 2 || (b2 & 0x80)) {
      // flat scanline
      for (let i = 0; i < w * 4; i++) rgba[out++] = buf[pos++];
      continue;
    }
    if (((b2 << 8) | b3) !== w) throw new Error('scanline width mismatch');
    pos += 4;
    // four separated channel planes, each RLE'd
    for (let c = 0; c < 4; c++) {
      let ptr = c * w;
      const end = (c + 1) * w;
      while (ptr < end) {
        const count = buf[pos++];
        if (count > 128) {                       // a run
          const val = buf[pos++];
          for (let i = 0; i < count - 128; i++) scan[ptr++] = val;
        } else {                                  // a literal dump
          for (let i = 0; i < count; i++) scan[ptr++] = buf[pos++];
        }
      }
    }
    for (let x = 0; x < w; x++) {
      rgba[out++] = scan[x];
      rgba[out++] = scan[x + w];
      rgba[out++] = scan[x + w * 2];
      rgba[out++] = scan[x + w * 3];
    }
  }

  const data = new Float32Array(w * h * 3);
  for (let i = 0, p = 0; i < w * h; i++) {
    const e = rgba[i * 4 + 3];
    const f = e ? Math.pow(2, e - 136) : 0;      // 2^(e-128) / 256
    data[p++] = rgba[i * 4] * f;
    data[p++] = rgba[i * 4 + 1] * f;
    data[p++] = rgba[i * 4 + 2] * f;
  }
  return { w, h, data };
}

/** Box-average down to exactly tw x th (source dims are multiples here). */
function downsample(src, tw, th) {
  const { w, h, data } = src;
  const out = new Float32Array(tw * th * 3);
  const bx = w / tw, by = h / th;
  for (let y = 0; y < th; y++) {
    const y0 = Math.floor(y * by), y1 = Math.floor((y + 1) * by);
    for (let x = 0; x < tw; x++) {
      const x0 = Math.floor(x * bx), x1 = Math.floor((x + 1) * bx);
      let r = 0, g = 0, b = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * w + sx) * 3;
          r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
        }
      }
      const o = (y * tw + x) * 3;
      out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n;
    }
  }
  return { w: tw, h: th, data: out };
}

/** float RGB -> Radiance .hdr bytes, new-style RLE. */
function encodeHDR({ w, h, data }) {
  const head = Buffer.from(`#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y ${h} +X ${w}\n`, 'ascii');
  const chunks = [head];
  const plane = new Uint8Array(w * 4);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const m = Math.max(r, g, b);
      let e = 0, s = 0;
      if (m > 1e-32) {
        e = Math.ceil(Math.log2(m)) + 1;         // mantissa stays < 1
        e = Math.max(-128, Math.min(127, e));
        s = 256 / Math.pow(2, e);
      }
      plane[x] = e ? Math.min(255, Math.floor(r * s)) : 0;
      plane[x + w] = e ? Math.min(255, Math.floor(g * s)) : 0;
      plane[x + w * 2] = e ? Math.min(255, Math.floor(b * s)) : 0;
      plane[x + w * 3] = e ? e + 128 : 0;
    }
    const row = [Buffer.from([2, 2, (w >> 8) & 0xff, w & 0xff])];
    for (let c = 0; c < 4; c++) row.push(rleChannel(plane.subarray(c * w, (c + 1) * w)));
    chunks.push(Buffer.concat(row));
  }
  return Buffer.concat(chunks);
}

/** Radiance new-RLE for one channel plane: runs are 129..255, literals 1..128. */
function rleChannel(p) {
  const out = [];
  const n = p.length;
  let i = 0;
  while (i < n) {
    let run = 1;
    while (i + run < n && p[i + run] === p[i] && run < 127) run++;
    if (run >= 4) {
      out.push(128 + run, p[i]);
      i += run;
    } else {
      // gather a literal block, stopping before any run of 4+
      const start = i;
      let lit = 0;
      while (i < n && lit < 128) {
        let r = 1;
        while (i + r < n && p[i + r] === p[i] && r < 5) r++;
        if (r >= 4) break;
        i++; lit++;
      }
      out.push(lit);
      for (let k = start; k < start + lit; k++) out.push(p[k]);
    }
  }
  return Buffer.from(out);
}

export { decodeHDR, downsample, encodeHDR };
