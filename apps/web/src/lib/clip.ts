import { RawImage, pipeline } from "@huggingface/transformers";

type FeatureVector = number[];
type FeatureMatrix = FeatureVector[];
type FeatureOutput = {
  tolist(): FeatureMatrix | FeatureVector;
};
type FeatureExtractor = (image: RawImage) => Promise<FeatureOutput>;

let extractorPromise: Promise<FeatureExtractor> | null = null;

function getExtractor(): Promise<FeatureExtractor> {
  if (extractorPromise === null) {
    extractorPromise = pipeline(
      "image-feature-extraction",
      "Xenova/clip-vit-base-patch32",
      { dtype: "q8" },
    ) as Promise<FeatureExtractor>;
  }

  return extractorPromise;
}

export async function getEmbedding(image: Blob): Promise<number[]> {
  const extractor = await getExtractor();
  const output = await extractor(await RawImage.fromBlob(image));
  const values = output.tolist();
  const embedding = (Array.isArray(values[0]) ? values[0] : values) as number[];

  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error("The image model returned an empty embedding.");
  }

  return embedding;
}
