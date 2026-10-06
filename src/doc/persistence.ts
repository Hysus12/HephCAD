// 文件持久化：OPFS 優先（iPadOS 18.4+ 的 Safari 支援 createWritable），
// 不支援時退回 localStorage（journal JSON 很小，足夠）。

import type { DocumentFile } from './journal.ts'

const OPFS_FILE = 'hephcad-current.json'
const LOCALSTORAGE_KEY = 'hephcad-doc'

async function opfsRoot(): Promise<FileSystemDirectoryHandle | null> {
  try {
    if (!navigator.storage?.getDirectory) return null
    return await navigator.storage.getDirectory()
  } catch {
    return null
  }
}

export async function saveDocument(doc: DocumentFile): Promise<void> {
  const json = JSON.stringify(doc)
  const root = await opfsRoot()
  if (root) {
    try {
      const handle = await root.getFileHandle(OPFS_FILE, { create: true })
      if ('createWritable' in handle) {
        const writable = await handle.createWritable()
        await writable.write(json)
        await writable.close()
        return
      }
    } catch {
      // 落到 localStorage
    }
  }
  try {
    localStorage.setItem(LOCALSTORAGE_KEY, json)
  } catch (e) {
    console.warn('[doc] 存檔失敗：', e)
  }
}

export async function loadDocument(): Promise<DocumentFile | null> {
  const root = await opfsRoot()
  if (root) {
    try {
      const handle = await root.getFileHandle(OPFS_FILE)
      const file = await handle.getFile()
      const text = await file.text()
      return parseDocument(text)
    } catch {
      // 沒檔案或讀取失敗 → 試 localStorage
    }
  }
  try {
    const text = localStorage.getItem(LOCALSTORAGE_KEY)
    return text ? parseDocument(text) : null
  } catch {
    return null
  }
}

function parseDocument(text: string): DocumentFile | null {
  try {
    const doc = JSON.parse(text) as DocumentFile
    if (doc.version !== 1 || !Array.isArray(doc.entries)) return null
    return {
      version: 1,
      entries: doc.entries,
      cursor: Math.min(Math.max(0, doc.cursor ?? doc.entries.length), doc.entries.length),
    }
  } catch {
    return null
  }
}
