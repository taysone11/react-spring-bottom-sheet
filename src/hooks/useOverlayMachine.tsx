import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { interpret } from 'xstate'
import type { InterpreterFrom, StateFrom } from 'xstate'
import { overlayMachine } from '../machines/overlay'

type OverlayMachine = typeof overlayMachine
type OverlayState = StateFrom<OverlayMachine>
type OverlayService = InterpreterFrom<OverlayMachine>
type OverlayOptions = Parameters<OverlayMachine['withConfig']>[0] & {
  devTools?: boolean
  context: OverlayState['context']
}

export function useOverlayMachine({
  context,
  devTools,
  ...config
}: OverlayOptions): [OverlayState, OverlayService['send']] {
  const configRef = useRef(config)
  configRef.current = config
  const { initialState } = context

  const machine = useMemo(
    () => overlayMachine.withConfig(configRef.current, { initialState }),
    [initialState]
  )
  const serviceRef = useRef<OverlayService | null>(null)
  const [state, setState] = useState<OverlayState>(() => machine.initialState)

  useEffect(() => {
    const service = interpret(machine, { devTools })
      .onTransition((nextState) => {
        if (nextState.changed !== false) {
          setState(nextState)
        }
      })
      .start()

    serviceRef.current = service
    setState(service.state)

    return () => {
      service.stop()
      serviceRef.current = null
    }
  }, [devTools, machine])

  const send = useCallback(
    (...args: Parameters<OverlayService['send']>) =>
      serviceRef.current?.send(...args),
    []
  ) as OverlayService['send']

  return [state, send]
}
