/**
 * Offline runtime facade — stable surface over the worker client.
 * Consumers import from "@/utils/offlineWorker" instead of reaching into
 * "@/utils/offline/workerClient" (which auto-initializes on import).
 */

import { offlineWorker } from "@/utils/offline/workerClient"

export { offlineWorker }
export { offlineState } from "@/utils/offline/offlineState"

export default offlineWorker
