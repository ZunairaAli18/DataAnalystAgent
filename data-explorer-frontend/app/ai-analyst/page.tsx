"use client"

import React from "react"

import { useState } from "react"
import { AppLayout } from "@/components/app-layout"
import { Send } from "lucide-react"

interface Message {
  id: string
  content: string
  isUser: boolean
}

export default function AIAnalystPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      content: '"Show sales by city as a graph"',
      isUser: true,
    },
    {
      id: "2", 
      content: "Ask me anything about your business data.",
      isUser: false,
    },
  ])
  const [input, setInput] = useState("")

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return

    const newMessage: Message = {
      id: Date.now().toString(),
      content: input,
      isUser: true,
    }
    setMessages([...messages, newMessage])
    setInput("")

    // Simulate AI response
    setTimeout(() => {
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        content: "I'm analyzing your request. Let me process the sales data by city...",
        isUser: false,
      }
      setMessages(prev => [...prev, aiResponse])
    }, 1000)
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-screen">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h1 className="text-lg font-semibold text-primary tracking-wider">ANALYST CHAT</h1>
          <div className="w-3 h-3 rounded-full bg-green-500" />
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-3xl mx-auto space-y-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.isUser ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-md px-4 py-3 rounded-lg ${
                    message.isUser
                      ? "bg-transparent text-muted-foreground italic"
                      : "bg-transparent text-muted-foreground"
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Input Area */}
        <div className="p-4 border-t border-border">
          <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
            <div className="relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask Analyst..."
                className="w-full px-4 py-3 pr-14 bg-card border border-border rounded-lg text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                type="submit"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center bg-violet-600 hover:bg-violet-500 rounded-lg transition-colors"
              >
                <Send className="w-5 h-5 text-foreground" />
              </button>
            </div>
            <p className="text-center text-xs text-muted-foreground mt-3 tracking-wider">
              DATA ENCRYPTED VIA AVANTESOFT SSL
            </p>
          </form>
        </div>
      </div>
    </AppLayout>
  )
}
