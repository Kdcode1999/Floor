// The pictures and the film that come with the app for the sample space, and where each one
// is. They are made by checks/make_sample_assets.py: a chart of made-up prices, a stand-in for
// a payment proof, and a few seconds of a chart drawing itself.

import { Asset } from "expo-asset";

import type { SampleAsset } from "./world";

const FILES: Record<SampleAsset, number> = {
  chart: require("@/assets/sample/chart.jpg"),
  chart2: require("@/assets/sample/chart-2.jpg"),
  proof: require("@/assets/sample/proof.jpg"),
  lesson: require("@/assets/sample/lesson.mp4"),
  poster: require("@/assets/sample/lesson-poster.jpg"),
};

/** The address a picture or the film can be shown from. */
export function sampleAssetUri(asset: SampleAsset): string {
  return Asset.fromModule(FILES[asset]).uri;
}
