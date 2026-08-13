import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { createJiti } from 'jiti';
import hyphen from 'hyphen/en-us/index.js';

const { hyphenateSync } = hyphen;

const jiti = createJiti(import.meta.url);
const { default: knuthPlass } = await jiti.import(
  '../src/engines/linebreaker/knuthPlass.ts',
);

const DEFAULT_SIZES = [500, 1000, 2000, 4000, 8000];
const DEFAULT_WARMUPS = 2;
const DEFAULT_RUNS = 7;
const LINE_WIDTH = 468;

const corpus = `Readable documents depend on more than choosing an attractive typeface. A careful layout gives each sentence enough room to breathe while keeping related ideas visually connected. Line length, word spacing, punctuation, and hyphenation work together to create an even rhythm across the page. When a paragraph contains unusually long terminology, the compositor must balance compact spacing against distracting gaps. The best result rarely comes from optimizing one line in isolation, because an acceptable choice near the beginning can create an awkward ending several lines later. Thoughtful typesetting considers those alternatives together and selects a sequence of breaks that remains comfortable from the first word to the last.`;

const characterWidth = (character) => {
  if ("ilI.,;:!|'".includes(character)) return 2.8;
  if ('mwMW'.includes(character)) return 8.2;
  if (character === ' ') return 3;
  return 5.6;
};

const textWidth = (text) => {
  let width = 0;
  for (const character of text) width += characterWidth(character);
  return width;
};

const makeParagraph = (wordCount) => {
  const sourceWords = corpus.split(/\s+/u);
  const words = [];

  for (let index = 0; index < wordCount; index += 1) {
    words.push(sourceWords[index % sourceWords.length]);
  }

  return words.join(' ');
};

const makeNodes = (wordCount) => {
  const paragraph = makeParagraph(wordCount);
  const hyphenated = hyphenateSync(paragraph);
  const tokens = hyphenated.split(/([ \u00ad])/u).filter(Boolean);
  const nodes = [];
  let offset = 0;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token === ' ') {
      const width = textWidth(token);
      nodes.push({
        type: 'glue',
        width,
        start: offset,
        end: offset + token.length,
        stretch: width / 2,
        shrink: width / 3,
      });
      offset += token.length;
      continue;
    }

    if (token === '\u00ad') {
      nodes.push({ type: 'penalty', width: 5, penalty: 100, flagged: 1 });
      continue;
    }

    nodes.push({
      type: 'box',
      width: textWidth(token),
      start: offset,
      end: offset + token.length,
      hyphenated: tokens[index + 1] === '\u00ad',
    });
    offset += token.length;
  }

  nodes.push({
    type: 'glue',
    width: 0,
    start: offset,
    end: offset,
    stretch: knuthPlass.infinity,
    shrink: 0,
  });
  nodes.push({
    type: 'penalty',
    width: 0,
    penalty: -knuthPlass.infinity,
    flagged: 1,
  });

  return { nodes, paragraph };
};

const createStats = () => ({
  breakpointsVisited: 0,
  candidateEvaluations: 0,
  feasibleCandidates: 0,
  activeNodesCreated: 0,
  activeNodesRemoved: 0,
  maxActiveNodes: 0,
  sumNodeVisits: 0,
});

const summarize = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  return {
    median: sorted[Math.floor(sorted.length / 2)],
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
};

const runCase = (wordCount, warmups, runs) => {
  const { nodes, paragraph } = makeNodes(wordCount);

  for (let index = 0; index < warmups; index += 1) {
    knuthPlass(nodes, [LINE_WIDTH], 4);
  }

  const wallMs = [];
  const cpuMs = [];
  let breakpoints;

  for (let index = 0; index < runs; index += 1) {
    globalThis.gc?.();
    const cpuStart = process.cpuUsage();
    const wallStart = performance.now();
    breakpoints = knuthPlass(nodes, [LINE_WIDTH], 4);
    wallMs.push(performance.now() - wallStart);
    const cpu = process.cpuUsage(cpuStart);
    cpuMs.push((cpu.user + cpu.system) / 1000);
  }

  const stats = createStats();
  const observedBreakpoints = knuthPlass(nodes, [LINE_WIDTH], 4, stats);
  const outputHash = createHash('sha256')
    .update(JSON.stringify(observedBreakpoints))
    .digest('hex');

  return {
    wordCount,
    characterCount: paragraph.length,
    nodeCount: nodes.length,
    lineCount: breakpoints.length - 1,
    outputHash,
    wallMs: summarize(wallMs),
    cpuMs: summarize(cpuMs),
    peakRssMb: process.resourceUsage().maxRSS / 1024,
    stats,
  };
};

const parseFlag = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : Number(process.argv[index + 1]);
};

const runWorker = () => {
  const size = parseFlag('--size', DEFAULT_SIZES[0]);
  const warmups = parseFlag('--warmups', DEFAULT_WARMUPS);
  const runs = parseFlag('--runs', DEFAULT_RUNS);
  process.stdout.write(`${JSON.stringify(runCase(size, warmups, runs))}\n`);
};

const runMatrix = () => {
  const sizesIndex = process.argv.indexOf('--sizes');
  const sizes =
    sizesIndex === -1
      ? DEFAULT_SIZES
      : process.argv[sizesIndex + 1].split(',').map(Number);
  const warmups = parseFlag('--warmups', DEFAULT_WARMUPS);
  const runs = parseFlag('--runs', DEFAULT_RUNS);
  const results = [];

  for (const size of sizes) {
    const child = spawnSync(
      process.execPath,
      [
        '--expose-gc',
        fileURLToPath(import.meta.url),
        '--worker',
        '--size',
        String(size),
        '--warmups',
        String(warmups),
        '--runs',
        String(runs),
      ],
      { encoding: 'utf8' },
    );

    if (child.status !== 0) {
      process.stderr.write(child.stderr);
      process.exit(child.status ?? 1);
    }

    results.push(JSON.parse(child.stdout));
  }

  process.stdout.write(
    `${JSON.stringify({ warmups, runs, lineWidth: LINE_WIDTH, results }, null, 2)}\n`,
  );
};

if (process.argv.includes('--worker')) runWorker();
else runMatrix();
