'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, Coins, ShieldAlert, Users } from 'lucide-react'
import { Nav } from '@/components/nav'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuthStore } from '@/stores/auth-store'
import {
  adjustCredits,
  banUser,
  listAdminUsers,
  listClaims,
  resolveClaim,
  unbanUser,
  type AdminUser,
  type Claim,
} from '@/lib/api'
import { formatCredits, formatRelativeDate } from '@/lib/formatters'
import { toast } from 'sonner'
import { ResolveClaimModal } from './_components/ResolveClaimModal'
import { UserActionsModal } from './_components/UserActionsModal'

type UserAction = 'ban' | 'unban' | 'credits'

export default function AdminPage() {
  const router = useRouter()
  const { session, profile, isLoading } = useAuthStore()
  const qc = useQueryClient()
  const [selectedClaim, setSelectedClaim] = useState<Claim | null>(null)
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null)
  const [userAction, setUserAction] = useState<UserAction | null>(null)
  const isAdmin = !!session && profile?.role === 'admin'
  const token = session?.access_token ?? ''

  useEffect(() => {
    if (!isLoading && !isAdmin) router.replace('/dashboard')
  }, [isAdmin, isLoading, router])

  const { data: claimsData } = useQuery({
    queryKey: ['admin-claims', 'open'],
    queryFn: () => listClaims(token, 'open'),
    enabled: isAdmin,
  })
  const { data: usersData } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => listAdminUsers(token),
    enabled: isAdmin,
  })

  if (isLoading || !isAdmin) return null

  async function handleResolveClaim(action: string, notes: string, credits: number) {
    if (!selectedClaim) return
    await resolveClaim(token, selectedClaim.id, action, notes, credits)
    toast.success('Reclamo resuelto')
    qc.invalidateQueries({ queryKey: ['admin-claims'] })
    setSelectedClaim(null)
  }

  async function handleUserAction(reason?: string, amount?: number, description?: string) {
    if (!selectedUser || !userAction) return
    if (userAction === 'ban') await banUser(token, selectedUser.id, reason!)
    if (userAction === 'unban') await unbanUser(token, selectedUser.id)
    if (userAction === 'credits') await adjustCredits(token, selectedUser.id, amount!, description!)
    toast.success('Accion ejecutada')
    qc.invalidateQueries({ queryKey: ['admin-users'] })
    setSelectedUser(null)
    setUserAction(null)
  }

  function openUserAction(user: AdminUser, action: UserAction) {
    setSelectedUser(user)
    setUserAction(action)
  }

  const claims = claimsData?.claims ?? []
  const users = usersData?.users ?? []
  const bannedUsers = users.filter((user) => user.banned_at).length

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand">Admin</p>
          <h1 className="mt-2 text-4xl font-semibold">Control de usuarios y reclamos.</h1>
        </header>

        <section className="mb-6 grid gap-4 sm:grid-cols-3">
          {[
            { label: 'Reclamos abiertos', value: claims.length, icon: ShieldAlert },
            { label: 'Usuarios', value: users.length, icon: Users },
            { label: 'Baneados', value: bannedUsers, icon: Ban },
          ].map((item) => {
            const Icon = item.icon
            return (
              <div key={item.label} className="surface-panel rounded-lg p-5">
                <Icon className="mb-5 size-5 text-brand" />
                <p className="font-mono text-3xl">{item.value}</p>
                <p className="mt-1 text-sm text-muted-foreground">{item.label}</p>
              </div>
            )
          })}
        </section>

        <Tabs defaultValue="claims" className="surface-panel rounded-lg p-4">
          <TabsList>
            <TabsTrigger value="claims">
              Reclamos{claims.length > 0 && <Badge variant="destructive" className="ml-1.5 text-xs">{claims.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="users">Usuarios</TabsTrigger>
          </TabsList>

          <TabsContent value="claims" className="pt-4">
            <div className="divide-y divide-border rounded-lg border border-border">
              {claims.length === 0 && <p className="p-5 text-sm text-muted-foreground">Sin reclamos abiertos.</p>}
              {claims.map((claim) => (
                <div key={claim.id} className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{claim.description}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{claim.type} · {formatRelativeDate(claim.created_at)}</p>
                  </div>
                  <Button size="sm" onClick={() => setSelectedClaim(claim)}>Resolver</Button>
                </div>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="users" className="pt-4">
            <div className="divide-y divide-border rounded-lg border border-border">
              {users.map((user) => (
                <div key={user.id} className="grid gap-3 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs text-muted-foreground">{user.id}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>{user.role}</Badge>
                      <span className="inline-flex items-center gap-1 text-xs"><Coins className="size-3 text-brand" />{formatCredits(user.credits)}</span>
                      <span className="text-xs text-muted-foreground">{user.total_jobs} jobs</span>
                      {user.banned_at && <Badge variant="destructive" className="text-xs">Baneado</Badge>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => openUserAction(user, 'credits')}>Creditos</Button>
                    {user.banned_at
                      ? <Button size="sm" variant="outline" onClick={() => openUserAction(user, 'unban')}>Desbanear</Button>
                      : <Button size="sm" variant="destructive" onClick={() => openUserAction(user, 'ban')}>Banear</Button>
                    }
                  </div>
                </div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </main>

      <ResolveClaimModal claim={selectedClaim} open={!!selectedClaim} onResolve={handleResolveClaim} onClose={() => setSelectedClaim(null)} />
      <UserActionsModal user={selectedUser} action={userAction} open={!!selectedUser} onConfirm={handleUserAction} onClose={() => { setSelectedUser(null); setUserAction(null) }} />
    </>
  )
}
