# Knuth-Plass benchmark

`knuthPlass.mjs` measures the line-breaking search independently from shaping
and line slicing. It builds realistic box/glue/penalty nodes from a self-authored
English paragraph using the package's US English hyphenator and approximate
proportional glyph widths.

Run the default matrix from the repository root:

```sh
node --expose-gc packages/textkit/benchmarks/knuthPlass.mjs
```

The default protocol uses isolated processes for 500, 1,000, 2,000, 4,000,
and 8,000 words at a 468-point line width. Each process performs two warmups
and seven measured runs. The JSON output contains wall-clock and process CPU
median/min/max, peak RSS, output hashes, and algorithm counters.

Override the matrix or repetition counts when needed:

```sh
node --expose-gc packages/textkit/benchmarks/knuthPlass.mjs \
  --sizes 500,1000,2000 --warmups 3 --runs 10
```

For V8 CPU profiling, run one size in worker mode:

```sh
node --cpu-prof packages/textkit/benchmarks/knuthPlass.mjs \
  --worker --size 4000 --warmups 3 --runs 20
```

The checked-in `knuthPlass.results.json` records the baseline and optimized
results, protocol, source revision, and machine details from the investigation.
