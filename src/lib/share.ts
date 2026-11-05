import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { isAndroidApp } from '../features/healthconnect/plugin'

/** What became of a share: sent to another app, saved as a download, copied, or dropped by the user. */
export type ShareOutcome = 'shared' | 'downloaded' | 'copied' | 'cancelled'

/** The user closing the share sheet: an AbortError in the browser, "Share canceled" from Android. */
const isCancel = (error: unknown) =>
  (error instanceof DOMException && error.name === 'AbortError') || /cancel/i.test(error instanceof Error ? error.message : String(error))

const base64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error ?? new Error('Não deu para ler a imagem.'))
    reader.readAsDataURL(blob)
  })

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/**
 * A file (the share image) to another app. In the Android app it goes through the cache folder to
 * the system's share sheet; in the browser, to its share sheet when it takes files, else it downloads.
 */
export async function shareFile(blob: Blob, fileName: string, title: string): Promise<ShareOutcome> {
  if (isAndroidApp()) {
    const { uri } = await Filesystem.writeFile({ path: fileName, data: await base64(blob), directory: Directory.Cache })
    try {
      await Share.share({ title, files: [uri], dialogTitle: title })
      return 'shared'
    } catch (error) {
      if (isCancel(error)) return 'cancelled'
      throw error
    }
  }
  const file = new File([blob], fileName, { type: blob.type })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title })
      return 'shared'
    } catch (error) {
      if (isCancel(error)) return 'cancelled'
      // Refused for another reason (no user gesture left, say): the download still works.
    }
  }
  download(blob, fileName)
  return 'downloaded'
}

/** Text to another app (a message to the coach): the share sheet, or the clipboard where there's none. */
export async function shareText(text: string, title: string): Promise<ShareOutcome> {
  if (isAndroidApp()) {
    try {
      await Share.share({ title, text, dialogTitle: title })
      return 'shared'
    } catch (error) {
      if (isCancel(error)) return 'cancelled'
      throw error
    }
  }
  if (navigator.share) {
    try {
      await navigator.share({ title, text })
      return 'shared'
    } catch (error) {
      if (isCancel(error)) return 'cancelled'
    }
  }
  await navigator.clipboard.writeText(text)
  return 'copied'
}
