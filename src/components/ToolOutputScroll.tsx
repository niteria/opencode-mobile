import { useRef, useState, type ReactNode } from "react"
import { ScrollView, View, type StyleProp, type ViewStyle } from "react-native"
import { Gesture, GestureDetector } from "react-native-gesture-handler"
import { dragOffset, flingTarget, CLAIM_MIN_DX, VERTICAL_FAIL_DY } from "../lib/horizontal-intent"

/** Keep a vertical drag inside overflowing tool output, even at its edges.
 * Like WideScroll, ownership is decided natively before the transcript's
 * ScrollView intercepts it. Horizontal drags remain available to nested diffs.
 */
export function ToolOutputScroll({ children, style, testID }: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
  testID?: string
}) {
  const scroll = useRef<ScrollView>(null)
  const offset = useRef(0)
  const start = useRef(0)
  const content = useRef(0)
  const height = useRef(0)
  const maximum = useRef(0)
  const [overflow, setOverflow] = useState(false)

  const measure = () => {
    maximum.current = Math.max(0, content.current - height.current)
    setOverflow(maximum.current > 1)
  }
  const pan = Gesture.Pan()
    .enabled(overflow)
    .activeOffsetY([-CLAIM_MIN_DX, CLAIM_MIN_DX])
    .failOffsetX([-VERTICAL_FAIL_DY, VERTICAL_FAIL_DY])
    .onStart(() => { start.current = offset.current })
    .onUpdate((event) => {
      offset.current = dragOffset(start.current, event.translationY, maximum.current)
      scroll.current?.scrollTo({ y: offset.current, animated: false })
    })
    .onEnd((event) => {
      const target = flingTarget(offset.current, event.velocityY / 1000, maximum.current)
      if (Math.abs(target - offset.current) > 1) {
        offset.current = target
        scroll.current?.scrollTo({ y: target, animated: true })
      }
    })
    .runOnJS(true)

  return (
    <GestureDetector gesture={pan}>
      <View>
        <ScrollView
          ref={scroll}
          style={style}
          testID={testID}
          scrollEnabled={false}
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={(_, value) => { content.current = value; measure() }}
          onLayout={(event) => { height.current = event.nativeEvent.layout.height; measure() }}
          onScroll={(event) => { offset.current = event.nativeEvent.contentOffset.y }}
          scrollEventThrottle={16}
        >
          {children}
        </ScrollView>
      </View>
    </GestureDetector>
  )
}
