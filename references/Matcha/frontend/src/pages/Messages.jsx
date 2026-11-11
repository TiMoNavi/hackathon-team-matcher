import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Layout from '../components/Layout'
import { teamStorage } from '../utils/teamStorage'

function Messages() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [selectedChat, setSelectedChat] = useState(null)
  const [message, setMessage] = useState('')
  const [conversations, setConversations] = useState([])

  const [messages, setMessages] = useState({})

  useEffect(() => {
    const userId = searchParams.get('user')
    const userName = searchParams.get('name')
    const preTypedMessage = searchParams.get('message')
    const userSkills = searchParams.get('skills')
    const userExperience = searchParams.get('experience')
    const userRole = searchParams.get('role')

    if (userId && userName) {
      // Find or create conversation
      const chatId = userId
      let chat = conversations.find(c => c.id === chatId)
      if (!chat) {
        const decodedName = decodeURIComponent(userName)
        chat = {
          id: chatId,
          name: decodedName,
          avatar: 'bg-matcha-green',
          online: true,
          lastMessage: '',
          time: 'now',
          unread: 0,
          skills: userSkills ? JSON.parse(decodeURIComponent(userSkills)) : [],
          experience: userExperience ? decodeURIComponent(userExperience) : 'intermediate',
          role: userRole ? decodeURIComponent(userRole) : 'Hackathon Participant'
        }
        setConversations([chat, ...conversations])
      }
      setSelectedChat(chat)

      // Set pre-typed message if provided
      if (preTypedMessage) {
        setMessage(decodeURIComponent(preTypedMessage))
      }

      // Initialize messages if not exists
      if (!messages[chat.id]) {
        setMessages({
          ...messages,
          [chat.id]: [
            {
              id: 1,
              type: 'system',
              text: `You matched with ${chat.name}! Start brewing ideas.`,
              time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            },
          ],
        })
      }
    } else if (conversations.length > 0 && !selectedChat) {
      setSelectedChat(conversations[0])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  const handleSendMessage = (e) => {
    e.preventDefault()
    if (!message.trim() || !selectedChat) return

    const newMessage = {
      id: Date.now(),
      sender: 'You',
      text: message,
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    }

    const updatedMessages = [...(messages[selectedChat.id] || []), newMessage]

    setMessages({
      ...messages,
      [selectedChat.id]: updatedMessages,
    })

    setMessage('')

    // Check if this is the first real message (excluding system messages)
    const isFirstMessage = updatedMessages.filter(msg => msg.type !== 'system' && msg.sender === 'You').length === 1

    // Auto-response after 2 seconds
    setTimeout(() => {
      const autoResponse = {
        id: Date.now() + 1,
        sender: selectedChat.name,
        text: "Sure, I'd love to join!",
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      }

      setMessages(prevMessages => ({
        ...prevMessages,
        [selectedChat.id]: [...(prevMessages[selectedChat.id] || []), autoResponse],
      }))

      // If this is the first message, add teammate to team after they respond
      if (isFirstMessage) {
        // Add teammate to team
        const teamMember = {
          id: selectedChat.id,
          name: selectedChat.name,
          avatar: selectedChat.avatar,
          skills: selectedChat.skills || [],
          experience: selectedChat.experience || 'intermediate',
          role: selectedChat.role || 'Hackathon Participant'
        }

        teamStorage.addMember(teamMember)

        // Add system message confirming they joined the team
        setTimeout(() => {
          const teamJoinMessage = {
            id: Date.now() + 2,
            type: 'system',
            text: `${selectedChat.name} has joined your team!`,
            time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          }

          setMessages(prevMessages => ({
            ...prevMessages,
            [selectedChat.id]: [...(prevMessages[selectedChat.id] || []), teamJoinMessage],
          }))
        }, 1000)
      }
    }, 2000)
  }

  const currentMessages = selectedChat ? (messages[selectedChat.id] || []) : []

  return (
    <Layout>
      <div className="flex h-full bg-gradient-to-br from-background-dark via-[#0d1a12] to-background-dark">
        {/* Middle Panel - Conversations List */}
        <div className="w-80 bg-[#111813] border-r border-[#28392e] flex flex-col">
          <div className="p-4 border-b border-[#28392e] flex items-center justify-between">
            <h2 className="text-white font-bold text-lg">Messages</h2>
            <button className="text-primary hover:text-primary/80">
              <span className="material-symbols-outlined">edit</span>
            </button>
          </div>
          <div className="p-4 border-b border-[#28392e]">
            <div className="relative">
              <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
                <span className="material-symbols-outlined text-sm">search</span>
              </span>
              <input
                type="text"
                placeholder="Search conversations"
                className="w-full pl-10 pr-4 py-2 bg-[#162a1d] border border-[#28392e] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                onClick={() => setSelectedChat(conversation)}
                className={`w-full p-4 flex items-center gap-3 hover:bg-[#1e3626] transition ${
                  selectedChat?.id === conversation.id ? 'bg-[#1e3626] border-l-2 border-primary' : ''
                }`}
              >
                <div className="relative">
                  <div className={`w-12 h-12 ${conversation.avatar} rounded-full flex items-center justify-center text-white font-bold`}>
                    {conversation.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  {conversation.online && (
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-primary rounded-full border-2 border-[#111813]"></div>
                  )}
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-white font-medium truncate">{conversation.name}</p>
                  <p className="text-[#9db9a6] text-sm truncate">{conversation.lastMessage}</p>
                </div>
                <div className="text-right">
                  <p className="text-[#9db9a6] text-xs">{conversation.time}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right Panel - Active Chat */}
        <div className="flex-1 flex flex-col bg-[#162a1d]">
          {selectedChat ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-[#28392e] bg-[#111813] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className={`w-10 h-10 ${selectedChat.avatar} rounded-full flex items-center justify-center text-white font-bold`}>
                      {selectedChat.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    {selectedChat.online && (
                      <div className="absolute bottom-0 right-0 w-3 h-3 bg-primary rounded-full border-2 border-[#111813]"></div>
                    )}
                  </div>
                  <div>
                    <p className="text-white font-medium">{selectedChat.name}</p>
                    <p className="text-primary text-xs">{selectedChat.online ? 'Online' : 'Offline'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#1e3626] rounded-lg transition">
                    <span className="material-symbols-outlined">call</span>
                  </button>
                  <button className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#1e3626] rounded-lg transition">
                    <span className="material-symbols-outlined">videocam</span>
                  </button>
                  <button className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#1e3626] rounded-lg transition">
                    <span className="material-symbols-outlined">more_vert</span>
                  </button>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {currentMessages.map((msg, idx) => {
                  const isSystem = msg.type === 'system'
                  const isMine = msg.sender === 'You'
                  const showDate = idx === 0 || currentMessages[idx - 1].time.split(' ')[0] !== msg.time.split(' ')[0]

                  return (
                    <div key={msg.id}>
                      {showDate && idx > 0 && (
                        <div className="flex items-center justify-center my-4">
                          <div className="h-px bg-matcha-green/20 flex-1"></div>
                          <span className="px-3 text-gray-500 text-xs">Today</span>
                          <div className="h-px bg-matcha-green/20 flex-1"></div>
                        </div>
                      )}
                      {isSystem ? (
                        <div className="text-center">
                          <p className="text-gray-400 text-sm italic">{msg.text}</p>
                        </div>
                      ) : (
                        <div className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                            isMine
                              ? 'bg-gradient-to-r from-matcha-green to-matcha-dark text-white'
                              : 'bg-black/50 text-gray-300 border border-matcha-green/20'
                          }`}>
                            {!isMine && (
                              <p className="text-primary text-xs font-medium mb-1">{msg.sender}</p>
                            )}
                            <p className="text-sm">{msg.text}</p>
                            <p className="text-xs opacity-70 mt-1 text-right">{msg.time}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Message Input */}
              <div className="p-4 border-t border-[#28392e] bg-[#111813]">
                <form onSubmit={handleSendMessage} className="flex items-center gap-2">
                  <button type="button" className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#1e3626] rounded-lg transition">
                    <span className="material-symbols-outlined">add</span>
                  </button>
                  <input
                    type="text"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 px-4 py-2 bg-[#162a1d] border border-[#28392e] rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button type="button" className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#1e3626] rounded-lg transition">
                    <span className="material-symbols-outlined">mood</span>
                  </button>
                  <button
                    type="submit"
                    className="w-10 h-10 flex items-center justify-center bg-primary text-black rounded-lg hover:bg-[#0fd650] transition"
                  >
                    <span className="material-symbols-outlined">send</span>
                  </button>
                </form>
                <p className="text-xs text-[#9db9a6] mt-2 text-center">
                  Press Enter to send, Shift+Enter for new line
                </p>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="text-6xl mb-4">💬</div>
                <p className="text-gray-400">Select a conversation to start chatting</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  )
}

export default Messages

