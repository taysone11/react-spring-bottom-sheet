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
type OverlayEvent = Parameters<OverlayService['send']>[0]

export function useOverlayMachine({
  context,
  devTools,
  ...config
}: OverlayOptions): [OverlayState, OverlayService['send']] {
  const configRef = useRef(config)
  configRef.current = config

  const machine = useMemo(
    () => overlayMachine.withConfig(configRef.current, context),
    [context]
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

  const send = useCallback<OverlayService['send']>(
    (event: OverlayEvent) => serviceRef.current?.send(event),
    []
  )

  return [state, send]
}
