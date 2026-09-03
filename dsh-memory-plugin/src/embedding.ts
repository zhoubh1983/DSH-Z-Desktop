/**
 * 本地 embedding 服务：Transformers.js + bge-small-zh-v1.5（ONNX, WASM 推理）。
 * 模型从 $DSH_HOME/dsh-memory/models/ 本地加载，完全离线；
 * 使用 onnxruntime-web（WASM），无 native ABI 问题，可在 Electron 内置 Node 下运行。
 */
import { env, pipeline } from '@xenova/transformers'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** embedding 模型标识（本地目录名，同时记录进 chunks.model 供校验）。 */
export const EMBEDDING_MODEL = 'bge-small-zh-v1.5'

/** 向量维度（bge-small-zh-v1.5）。 */
export const EMBEDDING_DIM = 512

/** 模型本地目录：$DSH_HOME/dsh-memory/models/ */
export function modelDir(): string {
  const base = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(base, 'dsh-memory', 'models')
}

let extractorPromise: Promise<unknown> | null = null

/** 懒加载并复用 feature-extraction pipeline（幂等）。 */
export function getExtractor(): Promise<unknown> {
  if (!extractorPromise) {
    env.allowRemoteModels = false
    env.localModelPath = modelDir() + '/'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    extractorPromise = pipeline('feature-extraction', EMBEDDING_MODEL)
  }
  return extractorPromise
}

/** 文本 → 归一化均值池化向量（Float32Array, 512 维）。 */
export async function embedText(text: string): Promise<Float32Array> {
  const extractor = await getExtractor()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const out = await (extractor as any)(text.slice(0, 8000), { pooling: 'mean', normalize: true })
  return out.data as Float32Array
}
