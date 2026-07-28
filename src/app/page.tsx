import { MorpheusHome } from "@/components/morpheus/MorpheusHome";

/**
 * The opening experience.
 *
 * This route used to be the Capital dashboard. It is now Morpheus, and the
 * dashboard moved intact to `/capital` — nothing was removed, the hierarchy
 * changed. The six workspaces remain in navigation and remain the place detail
 * lives; they simply stopped being the first thing a person meets.
 *
 * The pre-hydration requirement still holds: the greeting, both answers and the
 * suggested action are rendered from deterministic domain functions, so the
 * page carries a usable answer in its initial HTML rather than a shell waiting
 * for JavaScript.
 */
export default function MorpheusPage() {
  return <MorpheusHome />;
}
