import React, { useEffect, useState, useRef } from 'react'
import io from 'socket.io-client'

function Auth({ onAuth }){
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')

  async function register(){
    const res = await fetch('/api/register', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username, password }) })
    const j = await res.json();
    if (j.error) return setMsg(j.error)
    onAuth(j.token, j.user)
  }

  async function login(){
    const res = await fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username, password }) })
    const j = await res.json();
    if (j.error) return setMsg(j.error)
    onAuth(j.token, j.user)
  }

  return (
    <div className="auth">
      <h2>Discord Clone - Login / Register</h2>
      <input placeholder="username" value={username} onChange={e=>setUsername(e.target.value)} />
      <input placeholder="password" type="password" value={password} onChange={e=>setPassword(e.target.value)} />
      <div className="row">
        <button onClick={register}>Register</button>
        <button onClick={login}>Login</button>
      </div>
      <div className="msg">{msg}</div>
    </div>
  )
}

function ServerList({ servers, selectedServerId, onSelect, onCreate }){
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')

  async function create(){
    if (!newName) return;
    await onCreate(newName)
    setNewName('')
    setShowCreate(false)
  }

  return (
    <div className="serverList">
      <h3>Servers</h3>
      <ul>
        {servers.map(s => (
          <li key={s.id} className={selectedServerId === s.id ? 'active' : ''} onClick={() => onSelect(s)}>
            {s.name}
          </li>
        ))}
      </ul>
      {showCreate ? (
        <div className="createForm">
          <input placeholder="Server name" value={newName} onChange={e=>setNewName(e.target.value)} />
          <button onClick={create}>Create</button>
          <button onClick={() => setShowCreate(false)}>Cancel</button>
        </div>
      ) : (
        <button onClick={() => setShowCreate(true)}>+ New Server</button>
      )}
    </div>
  )
}

function ChannelList({ channels, selectedChannelId, onSelect, onCreate, isOwner }){
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')

  async function create(){
    if (!newName) return;
    await onCreate(newName)
    setNewName('')
    setShowCreate(false)
  }

  return (
    <div className="channelList">
      <h3>Channels</h3>
      <ul>
        {channels.map(c => (
          <li key={c.id} className={selectedChannelId === c.id ? 'active' : ''} onClick={() => onSelect(c)}>
            # {c.name}
          </li>
        ))}
      </ul>
      {isOwner && (
        showCreate ? (
          <div className="createForm">
            <input placeholder="Channel name" value={newName} onChange={e=>setNewName(e.target.value)} />
            <button onClick={create}>Create</button>
            <button onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
        ) : (
          <button onClick={() => setShowCreate(true)}>+ New Channel</button>
        )
      )}
    </div>
  )
}

function ChannelChat({ socket, me, channel, serverId }){
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const messagesEndRef = useRef(null)

  useEffect(()=>{
    if (!socket || !channel) return;
    const fn = (m) => {
      if (m.channelId === channel.id) fetchMessages();
    }
    socket.on('channel_message', fn)
    return () => socket.off('channel_message', fn)
  }, [socket, channel])

  async function fetchMessages(){
    const res = await fetch('/api/channels/' + channel.id + '/messages', { headers: { 'Authorization': 'Bearer ' + localStorage.token } })
    const j = await res.json();
    setMessages(j.messages || [])
  }

  useEffect(()=>{ if (channel) fetchMessages() }, [channel])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function send(){
    if (!text) return;
    socket.emit('channel_message', { channelId: channel.id, content: text })
    setText('')
  }

  function handleKeyPress(e){
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div className="channelChat">
      <div className="chatHeader"># {channel.name}</div>
      <div className="messages">
        {messages.map(m => (
          <div key={m.id} className={m.user_id === me.id ? 'msg me' : 'msg them'}>
            <span className="username">{m.username}</span>: {m.content}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="composer">
        <input 
          value={text} 
          onChange={e=>setText(e.target.value)} 
          onKeyPress={handleKeyPress}
          placeholder={`Message #${channel.name}`} 
        />
        <button onClick={send}>Send</button>
      </div>
    </div>
  )
}

export default function App(){
  const API = import.meta.env.VITE_API_BASE || ''
  const [token, setToken] = useState(localStorage.token || null)
  const [me, setMe] = useState(null)
  const [socket, setSocket] = useState(null)
  const [servers, setServers] = useState([])
  const [selectedServer, setSelectedServer] = useState(null)
  const [channels, setChannels] = useState([])
  const [selectedChannel, setSelectedChannel] = useState(null)

  useEffect(()=>{
    if (!token) return;
    localStorage.token = token
    // fetch my info
    fetch('/api/me', { headers: { 'Authorization': 'Bearer ' + token } }).then(r=>r.json()).then(j=>{ setMe(j.user) })
    // connect socket
    const s = (API && API !== '') ? io(API, { auth: { token } }) : io({ auth: { token } })
    setSocket(s)
    s.on('connect_error', e=>console.error('sock err', e))

    return () => s.close()
  }, [token])

  useEffect(()=>{ if (!token) return; loadServers(); }, [token])

  async function onAuth(t, user){ setToken(t); setMe(user) }

  async function loadServers(){
    const res = await fetch((API || '') + '/api/servers', { headers: { 'Authorization': 'Bearer ' + token } })
    const j = await res.json(); 
    setServers(j.servers || [])
    // Auto-select first server if available
    if (j.servers && j.servers.length > 0 && !selectedServer) {
      selectServer(j.servers[0])
    }
  }

  async function createServer(name){
    const res = await fetch((API || '') + '/api/servers', { 
      method:'POST', 
      headers:{'Content-Type':'application/json', 'Authorization':'Bearer ' + token}, 
      body: JSON.stringify({ name }) 
    })
    const j = await res.json();
    if (j.error) return alert('Error: ' + j.error)
    loadServers()
  }

  async function selectServer(server){
    setSelectedServer(server)
    setSelectedChannel(null)
    // Load channels
    const res = await fetch((API || '') + '/api/servers/' + server.id + '/channels', { 
      headers: { 'Authorization': 'Bearer ' + token } 
    })
    const j = await res.json();
    setChannels(j.channels || [])
    // Auto-select first channel
    if (j.channels && j.channels.length > 0) {
      setSelectedChannel(j.channels[0])
    }
  }

  async function createChannel(name){
    if (!selectedServer) return;
    const res = await fetch((API || '') + '/api/servers/' + selectedServer.id + '/channels', { 
      method:'POST', 
      headers:{'Content-Type':'application/json', 'Authorization':'Bearer ' + token}, 
      body: JSON.stringify({ name }) 
    })
    const j = await res.json();
    if (j.error) return alert('Error: ' + j.error)
    selectServer(selectedServer) // Reload channels
  }

  if (!token) return <Auth onAuth={onAuth} />

  return (
    <div className="discordApp">
      <div className="leftSidebar">
        <ServerList 
          servers={servers} 
          selectedServerId={selectedServer?.id} 
          onSelect={selectServer} 
          onCreate={createServer} 
        />
      </div>
      <div className="middleSidebar">
        {selectedServer && (
          <ChannelList 
            channels={channels} 
            selectedChannelId={selectedChannel?.id} 
            onSelect={setSelectedChannel} 
            onCreate={createChannel}
            isOwner={selectedServer.owner_id === me?.id}
          />
        )}
      </div>
      <div className="mainContent">
        {selectedChannel && selectedServer ? (
          <ChannelChat 
            socket={socket} 
            me={me} 
            channel={selectedChannel}
            serverId={selectedServer.id}
          />
        ) : (
          <div className="placeholder">
            <h2>Welcome to Discord Clone!</h2>
            <p>Select a server and channel to start chatting</p>
          </div>
        )}
      </div>
      <div className="userPanel">
        <div className="userInfo">
          <span className="username">{me?.username}</span>
        </div>
      </div>
    </div>
  )
}
