import type { ComponentType } from 'react';
import type { WBData } from '../data';
import { ConceptE } from './ConceptE';
import { ConceptB } from './ConceptB';
import { ConceptA } from './ConceptA';
import { ConceptK } from './ConceptK';
import { ConceptG } from './ConceptG';
import { ConceptH } from './ConceptH';
import { ConceptL } from './ConceptL';
import { ConceptM } from './ConceptM';
import { ConceptO } from './ConceptO';
import { ConceptI } from './ConceptI';
import { ConceptF } from './ConceptF';
import { ConceptC } from './ConceptC';
import { ConceptD } from './ConceptD';
import { ConceptJ } from './ConceptJ';
import { ConceptN } from './ConceptN';
import { ConceptPRD } from './ConceptPRD';
import { ConceptStub } from './ConceptStub';
import { findConcept, type ConceptId } from './registry';

/**
 * Concept lookup table. Adding a new concept now only requires:
 *   1) create `ConceptX.tsx` in this folder,
 *   2) import + add a `<id>: ConceptX` line below,
 *   3) flip `built: true` in registry.ts.
 *
 * Lookup is data-driven (map index) instead of switch dispatch, so adding a
 * concept does not balloon the function body. Future ports only touch this
 * file's import block + the COMPONENTS map — Workbench.tsx is stable forever.
 */
export type ConceptProps = { data: WBData; reload: () => void };

const COMPONENTS: Partial<Record<ConceptId, ComponentType<ConceptProps>>> = {
  e: ConceptE,
  b: ConceptB,
  a: ConceptA,
  k: ConceptK,
  g: ConceptG,
  h: ConceptH,
  l: ConceptL,
  m: ConceptM,
  o: ConceptO,
  i: ConceptI,
  f: ConceptF,
  c: ConceptC,
  d: ConceptD,
  j: ConceptJ,
  n: ConceptN,
  prd: ConceptPRD,
};

export function renderConcept(id: ConceptId, data: WBData, reload: () => void) {
  const Comp = COMPONENTS[id];
  if (Comp) return <Comp data={data} reload={reload} />;
  const entry = findConcept(id);
  return entry ? <ConceptStub entry={entry} /> : null;
}

/** Source of truth for "is this concept implemented?" — used by ConceptSwitcher. */
export function isConceptBuilt(id: ConceptId): boolean {
  return COMPONENTS[id] != null;
}
