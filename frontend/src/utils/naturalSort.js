/**
 * naturalSort.js
 * ==============
 * Numeric Officer ID sorting for the Allocation UI.
 *
 * Officer IDs look like "OFF1", "OFF2", "OFF10", "OFF100", "OFF001", "PED-7"
 * etc. A plain alphabetic sort puts OFF10 BEFORE OFF2, which is wrong. The
 * correct display order is by the NUMERIC part of the ID:
 *
 *   OFF1, OFF2, OFF3, OFF9, OFF10, OFF11, OFF20, OFF100
 *   (NOT OFF1, OFF10, OFF100, OFF11, OFF2, OFF20, OFF3)
 *
 * The LAST numeric run in the ID is extracted (OFF10 -> 10, OFF001 -> 1,
 * PED-7 -> 7) and compared numerically first; equal numbers fall back to a
 * plain string comparison (so "OFF1" and "OFF1A" keep a stable order).
 */

/** Returns the numeric part of an officer ID, or Number.MAX_SAFE_INTEGER when there is none. */
export function officerIdNumber(id) {
  const runs = String(id || '').match(/\d+/g);
  if (!runs || runs.length === 0) return Number.MAX_SAFE_INTEGER;
  return Number(runs[runs.length - 1]);
}

/** Comparator for two Officer ID strings: numeric part first, plain text after. */
export function compareOfficerIds(a, b) {
  const na = officerIdNumber(a);
  const nb = officerIdNumber(b);
  if (na !== nb) return na - nb;
  return String(a).localeCompare(String(b));
}

/** Comparator for two allocation rows based on the allocated officer's ID. */
export function compareAllocationsByOfficerId(x, y) {
  return compareOfficerIds(x.officer?.officerId, y.officer?.officerId);
}

/** Returns a NEW array of officer objects sorted by numeric Officer ID ascending. */
export function sortOfficersNumerically(list = []) {
  return [...list].sort((a, b) => compareOfficerIds(a.officerId, b.officerId));
}

/** Sorts an array of allocation rows IN PLACE and returns it. */
export function sortAllocationsNumerically(list = []) {
  return list.sort(compareAllocationsByOfficerId);
}