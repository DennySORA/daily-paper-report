import { createContext, useContext, useEffect } from 'react'

/** Lets a full-screen layer make the shell chrome (header, navigation) inert. */
export const ChromeInertContext = createContext<(inert: boolean) => void>(() => {})

export function useChromeInert(inert: boolean): void {
  const setInert = useContext(ChromeInertContext)
  useEffect(() => {
    setInert(inert)
    return () => setInert(false)
  }, [inert, setInert])
}
