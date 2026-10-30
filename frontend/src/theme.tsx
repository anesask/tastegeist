import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'

export type Theme = 'light' | 'dark'

function initial(): Theme {
  try {
    return localStorage.getItem('tg-theme') === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

// Apply before React renders so there is no flash of the wrong theme.
document.documentElement.dataset.theme = initial()

const Ctx = createContext<{ theme: Theme; toggle: () => void }>({
  theme: 'light',
  toggle: () => {},
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initial)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('tg-theme', theme)
    } catch {
      // storage can be unavailable (private mode); the toggle still works for this visit
    }
  }, [theme])
  return (
    <Ctx.Provider
      value={{
        theme,
        toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export const useTheme = () => useContext(Ctx)
