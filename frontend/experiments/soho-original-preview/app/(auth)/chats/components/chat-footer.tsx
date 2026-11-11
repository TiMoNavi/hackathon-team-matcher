"use client"

import { useEffect, useRef, useState } from "react"

import {
  Mic,
  Paperclip,
  Search,
  SendHorizontal,
  SmileIcon,
  Trash2,
} from "lucide-react"
import { useChatStore } from "../chat-store"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
type EmojiItem = { char: string; name: string }

const EMOJI_GROUPS: { label: string; emojis: EmojiItem[] }[] = [
  {
    label: "Smileys",
    emojis: [
      { char: "😀", name: "grinning happy" },
      { char: "😁", name: "beaming happy" },
      { char: "😂", name: "joy laugh tears" },
      { char: "🤣", name: "rofl laugh" },
      { char: "😅", name: "sweat smile relief" },
      { char: "😊", name: "blush smile" },
      { char: "😇", name: "halo angel innocent" },
      { char: "🙂", name: "slight smile" },
      { char: "😉", name: "wink" },
      { char: "😍", name: "heart eyes love" },
      { char: "🥰", name: "smiling hearts love" },
      { char: "😘", name: "kiss love" },
      { char: "😋", name: "yum tasty" },
      { char: "😜", name: "tongue wink crazy" },
      { char: "🤪", name: "zany crazy wild" },
      { char: "😎", name: "cool sunglasses" },
      { char: "🤩", name: "star struck wow" },
      { char: "🥳", name: "party celebrate" },
      { char: "🤔", name: "thinking hmm" },
      { char: "🙄", name: "eye roll" },
      { char: "😏", name: "smirk" },
      { char: "😒", name: "unamused meh" },
      { char: "😞", name: "disappointed sad" },
      { char: "😢", name: "crying sad tear" },
      { char: "😭", name: "sobbing crying sad" },
      { char: "😤", name: "triumph frustrated" },
      { char: "😡", name: "angry mad rage" },
      { char: "😱", name: "scream shocked" },
      { char: "😨", name: "fearful scared" },
      { char: "😴", name: "sleeping zzz tired" },
      { char: "🥱", name: "yawn tired bored" },
      { char: "🤯", name: "mind blown exploding" },
      { char: "😷", name: "mask sick" },
      { char: "🤒", name: "sick fever thermometer" },
      { char: "🤢", name: "nauseated sick gross" },
      { char: "🥶", name: "cold freezing" },
      { char: "🥵", name: "hot heat" },
      { char: "🤗", name: "hug warm" },
      { char: "🤫", name: "shush quiet secret" },
      { char: "🤭", name: "giggle oops" },
    ],
  },
  {
    label: "Gestures",
    emojis: [
      { char: "👍", name: "thumbs up like ok" },
      { char: "👎", name: "thumbs down dislike" },
      { char: "👊", name: "fist bump punch" },
      { char: "✊", name: "raised fist" },
      { char: "🤛", name: "left fist" },
      { char: "🤜", name: "right fist" },
      { char: "👏", name: "clap applause" },
      { char: "🙌", name: "raised hands hooray" },
      { char: "👐", name: "open hands" },
      { char: "🤲", name: "palms up" },
      { char: "🤝", name: "handshake deal" },
      { char: "🙏", name: "pray please thanks" },
      { char: "✌️", name: "victory peace" },
      { char: "🤞", name: "crossed fingers luck" },
      { char: "🤟", name: "love you gesture" },
      { char: "🤘", name: "rock on horns" },
      { char: "👌", name: "ok perfect" },
      { char: "👈", name: "point left" },
      { char: "👉", name: "point right" },
      { char: "👆", name: "point up" },
      { char: "👇", name: "point down" },
      { char: "✋", name: "raised hand stop" },
      { char: "👋", name: "wave hello bye" },
      { char: "💪", name: "muscle strong flex" },
    ],
  },
  {
    label: "Hearts & symbols",
    emojis: [
      { char: "❤️", name: "red heart love" },
      { char: "🧡", name: "orange heart" },
      { char: "💛", name: "yellow heart" },
      { char: "💚", name: "green heart" },
      { char: "💙", name: "blue heart" },
      { char: "💜", name: "purple heart" },
      { char: "🖤", name: "black heart" },
      { char: "🤍", name: "white heart" },
      { char: "💔", name: "broken heart sad" },
      { char: "❣️", name: "heart exclamation" },
      { char: "💕", name: "two hearts love" },
      { char: "💞", name: "revolving hearts" },
      { char: "💓", name: "beating heart" },
      { char: "💗", name: "growing heart" },
      { char: "💖", name: "sparkling heart" },
      { char: "💘", name: "heart arrow cupid" },
      { char: "💯", name: "hundred perfect score" },
      { char: "💥", name: "boom collision" },
      { char: "💫", name: "dizzy star" },
      { char: "⭐", name: "star" },
      { char: "🌟", name: "glowing star" },
      { char: "✨", name: "sparkles" },
      { char: "⚡", name: "lightning zap" },
      { char: "🔥", name: "fire lit hot" },
      { char: "🎉", name: "party popper tada" },
      { char: "🎊", name: "confetti celebrate" },
      { char: "🎁", name: "gift present" },
      { char: "🏆", name: "trophy winner" },
      { char: "🎈", name: "balloon" },
      { char: "🔔", name: "bell notification" },
      { char: "💡", name: "light bulb idea" },
      { char: "✅", name: "check done yes" },
    ],
  },
  {
    label: "Animals & nature",
    emojis: [
      { char: "🐶", name: "dog puppy" },
      { char: "🐱", name: "cat kitten" },
      { char: "🐭", name: "mouse" },
      { char: "🐹", name: "hamster" },
      { char: "🐰", name: "rabbit bunny" },
      { char: "🦊", name: "fox" },
      { char: "🐻", name: "bear" },
      { char: "🐼", name: "panda" },
      { char: "🐨", name: "koala" },
      { char: "🐯", name: "tiger" },
      { char: "🦁", name: "lion" },
      { char: "🐮", name: "cow" },
      { char: "🐷", name: "pig" },
      { char: "🐸", name: "frog" },
      { char: "🐵", name: "monkey" },
      { char: "🦄", name: "unicorn" },
      { char: "🐝", name: "bee" },
      { char: "🦋", name: "butterfly" },
      { char: "🌸", name: "cherry blossom flower" },
      { char: "🌹", name: "rose flower" },
      { char: "🌻", name: "sunflower" },
      { char: "🌈", name: "rainbow" },
      { char: "☀️", name: "sun sunny" },
      { char: "🌙", name: "moon night" },
      { char: "⛅", name: "partly cloudy" },
      { char: "❄️", name: "snowflake cold winter" },
      { char: "🌊", name: "wave ocean sea" },
      { char: "🍀", name: "clover luck" },
      { char: "🌵", name: "cactus" },
      { char: "🌴", name: "palm tree" },
      { char: "🍂", name: "fallen leaf autumn" },
      { char: "🌍", name: "earth globe world" },
    ],
  },
  {
    label: "Food & drink",
    emojis: [
      { char: "🍏", name: "green apple" },
      { char: "🍎", name: "apple" },
      { char: "🍊", name: "orange tangerine" },
      { char: "🍋", name: "lemon" },
      { char: "🍌", name: "banana" },
      { char: "🍉", name: "watermelon" },
      { char: "🍇", name: "grapes" },
      { char: "🍓", name: "strawberry" },
      { char: "🍒", name: "cherries" },
      { char: "🍑", name: "peach" },
      { char: "🥭", name: "mango" },
      { char: "🍍", name: "pineapple" },
      { char: "🥑", name: "avocado" },
      { char: "🍕", name: "pizza" },
      { char: "🍔", name: "burger hamburger" },
      { char: "🍟", name: "fries" },
      { char: "🌭", name: "hot dog" },
      { char: "🍿", name: "popcorn" },
      { char: "🧀", name: "cheese" },
      { char: "🥐", name: "croissant" },
      { char: "🍞", name: "bread" },
      { char: "🍩", name: "donut doughnut" },
      { char: "🍪", name: "cookie" },
      { char: "🎂", name: "birthday cake" },
      { char: "🍰", name: "cake shortcake" },
      { char: "🍫", name: "chocolate" },
      { char: "🍬", name: "candy sweet" },
      { char: "☕", name: "coffee" },
      { char: "🍵", name: "tea" },
      { char: "🥤", name: "soda drink cup" },
      { char: "🍺", name: "beer" },
      { char: "🍷", name: "wine" },
    ],
  },
  {
    label: "Activities & travel",
    emojis: [
      { char: "⚽", name: "soccer football" },
      { char: "🏀", name: "basketball" },
      { char: "🏈", name: "american football" },
      { char: "⚾", name: "baseball" },
      { char: "🎾", name: "tennis" },
      { char: "🏐", name: "volleyball" },
      { char: "🎱", name: "billiards pool eight ball" },
      { char: "🏓", name: "ping pong table tennis" },
      { char: "🥊", name: "boxing glove" },
      { char: "🎮", name: "video game controller gaming" },
      { char: "🎲", name: "dice game" },
      { char: "🎯", name: "dart target bullseye" },
      { char: "🎸", name: "guitar music" },
      { char: "🎹", name: "piano music" },
      { char: "🎤", name: "microphone sing karaoke" },
      { char: "🎧", name: "headphones music" },
      { char: "🎬", name: "clapper movie film" },
      { char: "📸", name: "camera photo" },
      { char: "✈️", name: "airplane flight travel" },
      { char: "🚀", name: "rocket launch space" },
      { char: "🚗", name: "car" },
      { char: "🚕", name: "taxi" },
      { char: "🚲", name: "bicycle bike" },
      { char: "🛴", name: "kick scooter" },
      { char: "🏖️", name: "beach vacation" },
      { char: "🏔️", name: "mountain snow" },
      { char: "🗺️", name: "world map travel" },
      { char: "🧳", name: "luggage suitcase travel" },
      { char: "⛺", name: "tent camping" },
      { char: "🎡", name: "ferris wheel amusement park" },
      { char: "🚢", name: "ship cruise" },
      { char: "🚁", name: "helicopter" },
    ],
  },
]

function formatFileSize(bytes: number) {
  const units = ["B", "KB", "MB", "GB"]
  let value = bytes
  let unit = 0

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }

  return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`
}

function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}

function FooterActionButton({
  icon,
  tooltip,
  onClick,
}: {
  icon: React.ReactNode
  tooltip: string
  onClick?: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 rounded-full"
            onClick={onClick}
          />
        }
      >
        {icon}
      </TooltipTrigger>
      <TooltipContent side="top">{tooltip}</TooltipContent>
    </Tooltip>
  )
}

function EmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  const [query, setQuery] = useState("")

  const searchTerm = query.trim().toLowerCase()
  const groups = searchTerm
    ? EMOJI_GROUPS.map((group) => ({
        ...group,
        emojis: group.emojis.filter((emoji) =>
          emoji.name.includes(searchTerm)
        ),
      })).filter((group) => group.emojis.length)
    : EMOJI_GROUPS

  return (
    <Popover onOpenChange={(open) => !open && setQuery("")}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 rounded-full"
          />
        }
      >
        <SmileIcon className="h-4 w-4" />
        <span className="sr-only">Emoji</span>
      </PopoverTrigger>
      <PopoverContent className="w-76 p-0" align="end">
        <div className="relative flex items-center p-2 pb-1">
          <Search className="absolute start-4.5 size-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search emoji..."
            className="h-8 ps-8 text-sm"
          />
        </div>
        <div className="max-h-72 space-y-3 overflow-y-auto scroll-fade scrollbar-none p-3 pt-2">
          {groups.length ? (
            groups.map((group) => (
              <div key={group.label}>
                <div className="px-1 pb-1.5 text-xs font-medium text-muted-foreground">
                  {group.label}
                </div>
                <div className="grid grid-cols-8 gap-0.5">
                  {group.emojis.map((emoji) => (
                    <button
                      key={emoji.char}
                      type="button"
                      title={emoji.name}
                      onClick={() => onSelect(emoji.char)}
                      className="flex size-8 cursor-pointer items-center justify-center rounded-md text-lg transition-colors hover:bg-muted"
                    >
                      {emoji.char}
                    </button>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No emoji found
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default function ChatFooter() {
  const sendMessage = useChatStore((state) => state.sendMessage)
  const [message, setMessage] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messageInputRef = useRef<HTMLInputElement>(null)

  const insertEmoji = (emoji: string) => {
    const input = messageInputRef.current

    if (!input) {
      setMessage((value) => value + emoji)
      return
    }

    const start = input.selectionStart ?? message.length
    const end = input.selectionEnd ?? start

    setMessage(message.slice(0, start) + emoji + message.slice(end))

    requestAnimationFrame(() => {
      const caret = start + emoji.length
      input.focus()
      input.setSelectionRange(caret, caret)
    })
  }

  const [isRecording, setIsRecording] = useState(false)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const discardRef = useRef(false)

  useEffect(() => {
    if (!isRecording) return

    const interval = setInterval(() => {
      setRecordSeconds((seconds) => seconds + 1)
    }, 1000)

    return () => clearInterval(interval)
  }, [isRecording])

  // Stop the recorder if the chat closes mid-recording
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current?.state === "recording") {
        discardRef.current = true
        mediaRecorderRef.current.stop()
      }
    }
  }, [])

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const content = message.trim()
    if (!content) return

    sendMessage({ content, type: "text" }, content)
    setMessage("")
  }

  const handleFiles = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    if (!files.length) return

    const images = files.filter((file) => file.type.startsWith("image/"))
    const videos = files.filter((file) => file.type.startsWith("video/"))
    const others = files.filter(
      (file) =>
        !file.type.startsWith("image/") && !file.type.startsWith("video/")
    )

    if (images.length) {
      sendMessage(
        {
          type: "image",
          data: { images: images.map((file) => URL.createObjectURL(file)) },
        },
        "📷 Photo"
      )
    }

    videos.forEach((file) => {
      sendMessage(
        { type: "video", data: { path: URL.createObjectURL(file) } },
        "🎬 Video"
      )
    })

    others.forEach((file) => {
      sendMessage(
        {
          type: "file",
          data: { file_name: file.name, size: formatFileSize(file.size) },
        },
        `📄 ${file.name}`
      )
    })

    event.target.value = ""
  }

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)

      chunksRef.current = []
      discardRef.current = false

      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data)
      }

      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())

        if (!discardRef.current && chunksRef.current.length) {
          const blob = new Blob(chunksRef.current, { type: recorder.mimeType })

          sendMessage(
            { type: "sound", data: { path: URL.createObjectURL(blob) } },
            "🎤 Voice message"
          )
        }

        setIsRecording(false)
        setRecordSeconds(0)
      }

      mediaRecorderRef.current = recorder
      recorder.start()
      setIsRecording(true)
    } catch {
      // Microphone unavailable or permission denied
    }
  }

  const stopRecording = (discard: boolean) => {
    discardRef.current = discard
    mediaRecorderRef.current?.stop()
  }

  return (
    <Card className="shrink-0 gap-0 py-0">
      <CardContent className="p-2 lg:p-3">
        {isRecording ? (
          <div className="flex h-11 items-center gap-3 px-2">
            <span className="relative flex size-3 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex size-3 rounded-full bg-red-500" />
            </span>
            <span className="flex-1 text-sm text-muted-foreground">
              Recording... {formatDuration(recordSeconds)}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="rounded-full"
              onClick={() => stopRecording(true)}
            >
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">Cancel recording</span>
            </Button>
            <Button
              type="button"
              size="icon"
              className="rounded-full"
              onClick={() => stopRecording(false)}
            >
              <SendHorizontal className="size-4" />
              <span className="sr-only">Send</span>
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="relative flex items-center">
            <Input
              ref={messageInputRef}
              type="text"
              className="border-transparent bg-transparent pe-48 shadow-none ring-0! focus-visible:border-transparent"
              placeholder="Enter message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <div className="absolute end-4 flex items-center">
              <div className="flex">
                <EmojiPicker onSelect={insertEmoji} />
                <FooterActionButton
                  icon={<Paperclip className="h-4 w-4" />}
                  tooltip="Select File"
                  onClick={() => fileInputRef.current?.click()}
                />
                <FooterActionButton
                  icon={<Mic className="h-4 w-4" />}
                  tooltip="Send Voice"
                  onClick={startRecording}
                />
              </div>
              <Button
                type="submit"
                size="icon"
                className="ms-3 rounded-full"
              >
                <SendHorizontal className="size-4" />
                <span className="sr-only">Send</span>
              </Button>
            </div>
          </form>
        )}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="sr-only"
          onChange={handleFiles}
        />
      </CardContent>
    </Card>
  )
}
