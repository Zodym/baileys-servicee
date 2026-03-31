import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  WAMessage,
  isJidGroup,
  jidNormalizedUser,
  GroupMetadata,
} from '@whiskeysockets/baileys'
import { Boom } from '@hapi/boom'
import pino from 'pino'
import QRCode from 'qrcode'
import path from 'path'
import fs from 'fs'
import { 
  updateConnectionStatus, 
  saveMessage, 
  saveOrUpdateGroup 
} from './firebase.js'

const logger = pino({ level: 'silent' })

// Tek bir kullanici icin WhatsApp session
class WhatsAppSession {
  private socket: WASocket | null = null
  private isConnected: boolean = false
  private ownerId: string
  private authPath: string
  private reconnectAttempts: number = 0
  private maxReconnectAttempts: number = 3
  private isInitializing: boolean = false

  constructor(ownerId: string) {
    this.ownerId = ownerId
    this.authPath = path.join(process.cwd(), 'auth_sessions', ownerId)
  }

  // Session'i baslat
  async start(): Promise<void> {
    if (this.isInitializing) {
      console.log(`[Session ${this.ownerId}] Zaten baslatiliyor...`)
      return
    }

    this.isInitializing = true
    console.log(`[Session ${this.ownerId}] Baslatiliyor...`)

    try {
      // Auth klasorunu olustur
      if (!fs.existsSync(this.authPath)) {
        fs.mkdirSync(this.authPath, { recursive: true })
      }

      await updateConnectionStatus(this.ownerId, 'connecting')

      const { state, saveCreds } = await useMultiFileAuthState(this.authPath)

      this.socket = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger,
        browser: ['WhatsApp Dashboard', 'Chrome', '120.0.0'],
        syncFullHistory: false,
        markOnlineOnConnect: false,
      })

      this.socket.ev.on('creds.update', saveCreds)

      this.socket.ev.on('connection.update', async (update) => {
        await this.handleConnectionUpdate(update)
      })

      this.socket.ev.on('messages.upsert', async (m) => {
        await this.handleMessages(m)
      })

      this.socket.ev.on('groups.upsert', async (groups) => {
        for (const group of groups) {
          await this.handleGroupUpdate(group)
        }
      })
    } catch (error) {
      console.error(`[Session ${this.ownerId}] Baslatma hatasi:`, error)
      await updateConnectionStatus(this.ownerId, 'error', {
        errorMessage: error instanceof Error ? error.message : 'Bilinmeyen hata'
      })
    } finally {
      this.isInitializing = false
    }
  }

  // Baglanti durumu degisiklikleri
  private async handleConnectionUpdate(update: {
    connection?: string
    lastDisconnect?: { error?: Error; date?: number }
    qr?: string
  }) {
    const { connection, lastDisconnect, qr } = update

    if (qr) {
      console.log(`[Session ${this.ownerId}] QR kod olusturuldu`)
      try {
        // QR kodu base64 olarak olustur
        const qrDataUrl = await QRCode.toDataURL(qr, {
          width: 256,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        })
        await updateConnectionStatus(this.ownerId, 'qr_ready', { qrCode: qrDataUrl })
      } catch (err) {
        console.error(`[Session ${this.ownerId}] QR olusturma hatasi:`, err)
      }
    }

    if (connection === 'close') {
      this.isConnected = false
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut

      console.log(`[Session ${this.ownerId}] Baglanti kapandi: ${statusCode}`)

      if (shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
        this.reconnectAttempts++
        console.log(`[Session ${this.ownerId}] Yeniden baglaniyor (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`)
        await updateConnectionStatus(this.ownerId, 'connecting')
        setTimeout(() => this.start(), 5000)
      } else if (!shouldReconnect) {
        console.log(`[Session ${this.ownerId}] Oturum kapatildi`)
        await updateConnectionStatus(this.ownerId, 'disconnected')
        // Auth dosyalarini temizle
        this.clearAuthFiles()
      } else {
        await updateConnectionStatus(this.ownerId, 'error', {
          errorMessage: 'Maksimum yeniden baglanti denemesi asildi'
        })
      }
    } else if (connection === 'open') {
      this.isConnected = true
      this.reconnectAttempts = 0
      console.log(`[Session ${this.ownerId}] Basariyla baglandi!`)

      // Telefon numarasini al
      const phoneNumber = this.socket?.user?.id?.split(':')[0] || ''
      const deviceName = this.socket?.user?.name || 'WhatsApp'

      await updateConnectionStatus(this.ownerId, 'connected', {
        phoneNumber,
        deviceName
      })

      // Gruplari senkronize et
      await this.syncGroups()
    }
  }

  // Mesajlari isle
  private async handleMessages(m: { messages: WAMessage[]; type: string }) {
    if (m.type !== 'notify') return

    for (const message of m.messages) {
      try {
        await this.processMessage(message)
      } catch (error) {
        console.error(`[Session ${this.ownerId}] Mesaj isleme hatasi:`, error)
      }
    }
  }

  // Tek mesaj isleme
  private async processMessage(message: WAMessage) {
    if (!message.key.id || !message.key.remoteJid) return

    const remoteJid = message.key.remoteJid
    if (!isJidGroup(remoteJid)) return
    if (message.key.fromMe) return

    const groupId = remoteJid
    const messageId = `${this.ownerId}_${message.key.id}`
    const senderId = message.key.participant || ''

    const content = this.extractMessageContent(message)
    if (!content) return

    const senderName = message.pushName || senderId.split('@')[0]

    let groupName = 'Bilinmeyen Grup'
    try {
      if (this.socket) {
        const metadata = await this.socket.groupMetadata(groupId)
        groupName = metadata.subject
      }
    } catch {
      // Grup metadata alinamadi
    }

    await saveMessage(messageId, {
      groupId,
      groupName,
      sender: {
        id: jidNormalizedUser(senderId),
        name: senderName,
        pushName: message.pushName,
      },
      content,
      timestamp: new Date((message.messageTimestamp as number) * 1000),
      ownerId: this.ownerId,
    })

    console.log(`[Session ${this.ownerId}] Mesaj: ${groupName} - ${senderName}`)
  }

  // Mesaj icerigini cikar
  private extractMessageContent(message: WAMessage) {
    const msg = message.message
    if (!msg) return null

    if (msg.conversation) {
      return { type: 'text' as const, text: msg.conversation }
    }
    if (msg.extendedTextMessage?.text) {
      return { type: 'text' as const, text: msg.extendedTextMessage.text }
    }
    if (msg.imageMessage) {
      return { type: 'image' as const, caption: msg.imageMessage.caption, mimeType: msg.imageMessage.mimetype }
    }
    if (msg.videoMessage) {
      return { type: 'video' as const, caption: msg.videoMessage.caption, mimeType: msg.videoMessage.mimetype }
    }
    if (msg.documentMessage) {
      return { type: 'document' as const, caption: msg.documentMessage.fileName, mimeType: msg.documentMessage.mimetype }
    }
    if (msg.audioMessage) {
      return { type: 'audio' as const, mimeType: msg.audioMessage.mimetype }
    }
    if (msg.stickerMessage) {
      return { type: 'sticker' as const, mimeType: msg.stickerMessage.mimetype }
    }

    return null
  }

  // Grup guncelleme
  private async handleGroupUpdate(group: GroupMetadata) {
    await saveOrUpdateGroup(group.id, {
      name: group.subject,
      description: group.desc,
      participantCount: group.participants.length,
      ownerId: this.ownerId,
    })
  }

  // Gruplari senkronize et
  private async syncGroups() {
    if (!this.socket) return

    try {
      const groups = await this.socket.groupFetchAllParticipating()
      for (const [groupId, group] of Object.entries(groups)) {
        await saveOrUpdateGroup(groupId, {
          name: group.subject,
          description: group.desc,
          participantCount: group.participants.length,
          ownerId: this.ownerId,
        })
      }
      console.log(`[Session ${this.ownerId}] ${Object.keys(groups).length} grup senkronize edildi`)
    } catch (error) {
      console.error(`[Session ${this.ownerId}] Grup senkronizasyon hatasi:`, error)
    }
  }

  // Auth dosyalarini temizle
  private clearAuthFiles() {
    try {
      if (fs.existsSync(this.authPath)) {
        fs.rmSync(this.authPath, { recursive: true, force: true })
        console.log(`[Session ${this.ownerId}] Auth dosyalari temizlendi`)
      }
    } catch (error) {
      console.error(`[Session ${this.ownerId}] Auth temizleme hatasi:`, error)
    }
  }

  // Session'i durdur
  async stop(): Promise<void> {
    console.log(`[Session ${this.ownerId}] Durduruluyor...`)
    if (this.socket) {
      this.socket.end(undefined)
      this.socket = null
    }
    this.isConnected = false
    await updateConnectionStatus(this.ownerId, 'disconnected')
  }

  // Oturumu kapat ve temizle
  async logout(): Promise<void> {
    console.log(`[Session ${this.ownerId}] Oturum kapatiliyor...`)
    if (this.socket) {
      await this.socket.logout()
      this.socket = null
    }
    this.isConnected = false
    this.clearAuthFiles()
    await updateConnectionStatus(this.ownerId, 'disconnected')
  }

  isSessionConnected(): boolean {
    return this.isConnected
  }

  getOwnerId(): string {
    return this.ownerId
  }
}

// Tum kullanici session'larini yoneten manager
export class WhatsAppManager {
  private sessions: Map<string, WhatsAppSession> = new Map()

  // Kullanici icin session baslat
  async startSession(ownerId: string): Promise<{ success: boolean; message: string }> {
    if (this.sessions.has(ownerId)) {
      const session = this.sessions.get(ownerId)!
      if (session.isSessionConnected()) {
        return { success: false, message: 'Bu kullanici zaten bagli' }
      }
    }

    const session = new WhatsAppSession(ownerId)
    this.sessions.set(ownerId, session)
    await session.start()

    return { success: true, message: 'Session baslatildi, QR kod bekleniyor' }
  }

  // Kullanici session'ini durdur
  async stopSession(ownerId: string): Promise<{ success: boolean; message: string }> {
    const session = this.sessions.get(ownerId)
    if (!session) {
      return { success: false, message: 'Aktif session bulunamadi' }
    }

    await session.stop()
    this.sessions.delete(ownerId)

    return { success: true, message: 'Session durduruldu' }
  }

  // Kullanici oturumunu kapat
  async logoutSession(ownerId: string): Promise<{ success: boolean; message: string }> {
    const session = this.sessions.get(ownerId)
    if (!session) {
      return { success: false, message: 'Aktif session bulunamadi' }
    }

    await session.logout()
    this.sessions.delete(ownerId)

    return { success: true, message: 'Oturum kapatildi' }
  }

  // Session durumunu kontrol et
  getSessionStatus(ownerId: string): { exists: boolean; connected: boolean } {
    const session = this.sessions.get(ownerId)
    return {
      exists: !!session,
      connected: session?.isSessionConnected() || false
    }
  }

  // Tum aktif session'lari listele
  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys())
  }

  // Tum session'lari durdur
  async stopAllSessions(): Promise<void> {
    for (const [ownerId, session] of this.sessions) {
      await session.stop()
      this.sessions.delete(ownerId)
    }
  }
}
