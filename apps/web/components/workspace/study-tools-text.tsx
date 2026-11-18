import { ChatAnswer } from "./chat-answer"

export function StudyText({ content }: { content: string }) {
  return <ChatAnswer text={content} />
}
