import { useQuery } from '@tanstack/react-query'
import { api } from './api'

/** The workspace's settings (brand kit, agency, defaults). Cached for the session; Settings invalidates it on save. */
export function useSettings() {
  return useQuery({ queryKey: ['settings'], queryFn: api.settings, staleTime: 5 * 60_000, retry: false })
}

/** Read a picked image file as a data URL, refusing anything over the server's limit. */
export function readLogo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) return reject(new Error('Use a PNG, JPEG, WebP or SVG file'))
    if (file.size > 140_000) return reject(new Error('Keep the logo under 140 KB'))
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('Could not read that file'))
    r.readAsDataURL(file)
  })
}
