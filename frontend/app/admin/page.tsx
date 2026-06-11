'use client'

import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Nav } from '@/components/nav'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { useAuthStore } from '@/stores/auth-store'
import { useRouter } from 'next/navigation'
import {
  listClaims, resolveClaim, listAdminUsers, banUser, unbanUser, adjustCredits,
  type Claim, type AdminUser,
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
    toast.success('Acción ejecutada')
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

  return (
    <>
      <Nav />
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <h1 className="text-2xl font-bold">Panel de Admin</h1>

        <Tabs defaultValue="claims">
          <TabsList>
            <TabsTrigger value="claims">
              Reclamos{claims.length > 0 && <Badge variant="destructive" className="ml-1.5 text-xs">{claims.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="users">Usuarios</TabsTrigger>
          </TabsList>

          <TabsContent value="claims" className="pt-4 space-y-2">
            {claims.length === 0 && <p className="text-sm text-muted-foreground">Sin reclamos abiertos.</p>}
            {claims.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg border border-border bg-card/50 px-4 py-3 gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{c.description}</p>
                  <p className="text-xs text-muted-foreground">{c.type} · {formatRelativeDate(c.created_at)}</p>
                </div>
                <Button size="sm" onClick={() => setSelectedClaim(c)}>Resolver</Button>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="users" className="pt-4 space-y-2">
            {users.map((u) => (
              <div key={u.id} className="flex items-center justify-between rounded-lg border border-border bg-card/50 px-4 py-3 gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs truncate text-muted-foreground">{u.id}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>{u.role}</Badge>
                    <span className="text-xs">{formatCredits(u.credits)}</span>
                    <span className="text-xs text-muted-foreground">{u.total_jobs} jobs</span>
                    {u.banned_at && <Badge variant="destructive" className="text-xs">Baneado</Badge>}
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => openUserAction(u, 'credits')}>
                    Créditos
                  </Button>
                  {u.banned_at
                    ? <Button size="sm" variant="outline" onClick={() => openUserAction(u, 'unban')}>Desbanear</Button>
                    : <Button size="sm" variant="destructive" onClick={() => openUserAction(u, 'ban')}>Banear</Button>
                  }
                </div>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </main>

      <ResolveClaimModal
        claim={selectedClaim}
        open={!!selectedClaim}
        onResolve={handleResolveClaim}
        onClose={() => setSelectedClaim(null)}
      />
      <UserActionsModal
        user={selectedUser}
        action={userAction}
        open={!!selectedUser}
        onConfirm={handleUserAction}
        onClose={() => { setSelectedUser(null); setUserAction(null) }}
      />
    </>
  )
}
