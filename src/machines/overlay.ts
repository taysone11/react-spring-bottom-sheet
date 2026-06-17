import { assign, createMachine, fromPromise } from 'xstate'

// This is the root machine, composing all the other machines and is the brain of the bottom sheet

export type OverlayEvent =
  | { type: 'OPEN' }
  | {
      type: 'SNAP'
      payload: {
        y: number
        velocity: number
        source: 'dragging' | 'custom' | string
      }
    }
  | { type: 'CLOSE' }
  | { type: 'DRAG' }
  | { type: 'RESIZE' }

// The context (extended state) of the machine
export interface OverlayContext {
  initialState: 'OPEN' | 'CLOSED'
  y: number
  velocity: number
  snapSource: 'dragging' | 'custom' | string
}

export type OverlayActorInput = {
  context: OverlayContext
  event: OverlayEvent
}

function sleep(ms = 1000) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const sleepActor = fromPromise(async () => {
  await sleep()
})

const debugActor = (label: string) =>
  fromPromise(async ({ input }: { input: OverlayActorInput }) => {
    console.group(label)
    console.log(input)
    await sleep()
    console.groupEnd()
  })

const cancelOpen = {
  CLOSE: { target: '#overlay.closing', actions: 'onOpenCancel' },
}
const openToDrag = {
  DRAG: { target: '#overlay.dragging', actions: 'onOpenEnd' },
}
const openToResize = {
  RESIZE: { target: '#overlay.resizing', actions: 'onOpenEnd' },
}

const actorInput = ({ context, event }) => ({ context, event })

const initiallyOpen = ({ context }) => context.initialState === 'OPEN'
const initiallyClosed = ({ context }) => context.initialState === 'CLOSED'

// Copy paste the machine into https://xstate.js.org/viz/ to make sense of what's going on in here ;)

export const overlayMachine = createMachine(
  {
    types: {} as {
      context: OverlayContext
      events: OverlayEvent
      input: Pick<OverlayContext, 'initialState'>
    },
    id: 'overlay',
    initial: 'closed',
    context: ({ input }) => ({
      initialState: input?.initialState ?? 'CLOSED',
      y: 0,
      velocity: 1,
      snapSource: 'custom',
    }),
    states: {
      closed: { on: { OPEN: 'opening', CLOSE: undefined } },
      opening: {
        initial: 'start',
        states: {
          start: {
            invoke: {
              src: 'onOpenStart',
              input: actorInput,
              onDone: 'transition',
            },
          },
          transition: {
            always: [
              { target: 'immediately', guard: 'initiallyOpen' },
              { target: 'smoothly', guard: 'initiallyClosed' },
            ],
          },
          immediately: {
            initial: 'open',
            states: {
              open: {
                invoke: {
                  src: 'openImmediately',
                  input: actorInput,
                  onDone: 'activating',
                },
              },
              activating: {
                invoke: {
                  src: 'activate',
                  input: actorInput,
                  onDone: '#overlay.opening.end',
                },
                on: { ...openToDrag, ...openToResize },
              },
            },
          },
          smoothly: {
            initial: 'visuallyHidden',
            states: {
              visuallyHidden: {
                invoke: {
                  src: 'renderVisuallyHidden',
                  input: actorInput,
                  onDone: 'activating',
                },
              },
              activating: {
                invoke: { src: 'activate', input: actorInput, onDone: 'open' },
              },
              open: {
                invoke: {
                  src: 'openSmoothly',
                  input: actorInput,
                  onDone: '#overlay.opening.end',
                },
                on: { ...openToDrag, ...openToResize },
              },
            },
          },
          end: {
            invoke: { src: 'onOpenEnd', input: actorInput, onDone: 'done' },
            on: { CLOSE: '#overlay.closing', DRAG: '#overlay.dragging' },
          },
          done: {
            type: 'final',
          },
        },
        on: { ...cancelOpen },
        onDone: 'open',
      },
      open: {
        on: { DRAG: '#overlay.dragging', SNAP: 'snapping', RESIZE: 'resizing' },
      },
      dragging: {
        on: { SNAP: 'snapping' },
      },
      snapping: {
        initial: 'start',
        states: {
          start: {
            invoke: {
              src: 'onSnapStart',
              input: actorInput,
              onDone: 'snappingSmoothly',
            },
            entry: [
              assign({
                y: ({ event }) => (event.type === 'SNAP' ? event.payload.y : 0),
                velocity: ({ event }) =>
                  event.type === 'SNAP' ? event.payload.velocity : 1,
                snapSource: ({ event }) =>
                  event.type === 'SNAP'
                    ? event.payload.source || 'custom'
                    : 'custom',
              }),
            ],
          },
          snappingSmoothly: {
            invoke: { src: 'snapSmoothly', input: actorInput, onDone: 'end' },
          },
          end: {
            invoke: { src: 'onSnapEnd', input: actorInput, onDone: 'done' },
            on: {
              RESIZE: '#overlay.resizing',
              SNAP: '#overlay.snapping',
              CLOSE: '#overlay.closing',
              DRAG: '#overlay.dragging',
            },
          },
          done: { type: 'final' },
        },
        on: {
          SNAP: { target: 'snapping', actions: 'onSnapEnd' },
          RESIZE: { target: '#overlay.resizing', actions: 'onSnapCancel' },
          DRAG: { target: '#overlay.dragging', actions: 'onSnapCancel' },
          CLOSE: { target: '#overlay.closing', actions: 'onSnapCancel' },
        },
        onDone: 'open',
      },
      resizing: {
        initial: 'start',
        states: {
          start: {
            invoke: {
              src: 'onResizeStart',
              input: actorInput,
              onDone: 'resizingSmoothly',
            },
          },
          resizingSmoothly: {
            invoke: { src: 'resizeSmoothly', input: actorInput, onDone: 'end' },
          },
          end: {
            invoke: { src: 'onResizeEnd', input: actorInput, onDone: 'done' },
            on: {
              SNAP: '#overlay.snapping',
              CLOSE: '#overlay.closing',
              DRAG: '#overlay.dragging',
            },
          },
          done: { type: 'final' },
        },
        on: {
          RESIZE: { target: 'resizing', actions: 'onResizeEnd' },
          SNAP: { target: 'snapping', actions: 'onResizeCancel' },
          DRAG: { target: '#overlay.dragging', actions: 'onResizeCancel' },
          CLOSE: { target: '#overlay.closing', actions: 'onResizeCancel' },
        },
        onDone: 'open',
      },
      closing: {
        initial: 'start',
        states: {
          start: {
            invoke: {
              src: 'onCloseStart',
              input: actorInput,
              onDone: 'deactivating',
            },
            on: { OPEN: { target: '#overlay.open', actions: 'onCloseCancel' } },
          },
          deactivating: {
            invoke: {
              src: 'deactivate',
              input: actorInput,
              onDone: 'closingSmoothly',
            },
          },
          closingSmoothly: {
            invoke: { src: 'closeSmoothly', input: actorInput, onDone: 'end' },
          },
          end: {
            invoke: { src: 'onCloseEnd', input: actorInput, onDone: 'done' },
            on: {
              OPEN: { target: '#overlay.opening', actions: 'onCloseCancel' },
            },
          },
          done: { type: 'final' },
        },
        on: {
          CLOSE: undefined,
          OPEN: { target: '#overlay.opening', actions: 'onCloseCancel' },
        },
        onDone: 'closed',
      },
    },
    on: {
      CLOSE: '#overlay.closing',
    },
  },
  {
    actions: {
      onOpenCancel: (context, event) => {
        console.log('onOpenCancel', { context, event })
      },
      onSnapCancel: (context, event) => {
        console.log('onSnapCancel', { context, event })
      },
      onResizeCancel: (context, event) => {
        console.log('onResizeCancel', { context, event })
      },
      onCloseCancel: (context, event) => {
        console.log('onCloseCancel', { context, event })
      },
      onOpenEnd: (context, event) => {
        console.log('onOpenCancel', { context, event })
      },
      onSnapEnd: (context, event) => {
        console.log('onSnapEnd', { context, event })
      },
      onRezizeEnd: (context, event) => {
        console.log('onRezizeEnd', { context, event })
      },
    },
    actors: {
      onSnapStart: sleepActor,
      onOpenStart: sleepActor,
      onCloseStart: sleepActor,
      onResizeStart: sleepActor,
      onSnapEnd: sleepActor,
      onOpenEnd: sleepActor,
      onCloseEnd: sleepActor,
      onResizeEnd: sleepActor,
      renderVisuallyHidden: debugActor('renderVisuallyHidden'),
      activate: debugActor('activate'),
      deactivate: debugActor('deactivate'),
      openSmoothly: debugActor('openSmoothly'),
      openImmediately: debugActor('openImmediately'),
      snapSmoothly: debugActor('snapSmoothly'),
      resizeSmoothly: debugActor('resizeSmoothly'),
      closeSmoothly: debugActor('closeSmoothly'),
    },
    guards: { initiallyClosed, initiallyOpen },
  }
)
