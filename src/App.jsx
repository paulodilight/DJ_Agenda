import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store'
import { Layout } from '@/components/ui/Layout'
import { Login } from '@/pages/Login'
import { Dashboard } from '@/pages/Dashboard'
import { DJs } from '@/pages/DJs'
import { DJPerfil } from '@/pages/DJPerfil'
import { Espacos } from '@/pages/Espacos'
import { Agenda } from '@/pages/Agenda'
import { Bloqueios } from '@/pages/Bloqueios'
import { Distribuicao } from '@/pages/Distribuicao'
import { Configuracoes } from '@/pages/Configuracoes'
import { EspacoPerfil } from '@/pages/EspacoPerfil'
import { Atuacoes } from '@/pages/Atuacoes'
import { Equilibrio } from '@/pages/Equilibrio'
import { Comunicacao } from '@/pages/Comunicacao'
import { Contas } from '@/pages/Contas'
import { ContasDashboard } from '@/pages/contas/ContasDashboard'
import { ContasDJs } from '@/pages/contas/ContasDJs'
import { ContasClientes } from '@/pages/contas/ContasClientes'
import { ContasColaboradores } from '@/pages/contas/ContasColaboradores'
import { ContasMargens } from '@/pages/contas/ContasMargens'
import { Eventos } from '@/pages/Eventos'
import { ApoioTecnico } from '@/pages/ApoioTecnico'
import { ResetPassword } from '@/pages/ResetPassword'
import { LoadingPage } from '@/components/ui/LoadingSpinner'

function RotaProtegida({ children }) {
  const { session, loading } = useAuthStore()
  if (loading) return <div className="min-h-screen bg-surface-0 flex items-center justify-center"><LoadingPage /></div>
  if (!session) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  const init = useAuthStore((s) => s.init)

  useEffect(() => { init() }, [init])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route
          path="/"
          element={
            <RotaProtegida>
              <Layout />
            </RotaProtegida>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="djs" element={<DJs />} />
          <Route path="djs/:id" element={<DJPerfil />} />
          <Route path="espacos" element={<Espacos />} />
          <Route path="espacos/:id" element={<EspacoPerfil />} />
          <Route path="bloqueios" element={<Bloqueios />} />
          <Route path="agenda" element={<Agenda />} />
          <Route path="atuacoes" element={<Atuacoes />} />
          <Route path="distribuicao" element={<Distribuicao />} />
          <Route path="equilibrio" element={<Equilibrio />} />
          <Route path="eventos" element={<Eventos />} />
          <Route path="apoio-tecnico" element={<ApoioTecnico />} />
          <Route path="comunicacao" element={<Comunicacao />} />
          <Route path="contas" element={<Contas />}>
            <Route index element={<ContasDashboard />} />
            <Route path="djs" element={<ContasDJs />} />
            <Route path="clientes" element={<ContasClientes />} />
            <Route path="colaboradores" element={<ContasColaboradores />} />
            <Route path="margens"       element={<ContasMargens />} />
          </Route>
          <Route path="configuracoes" element={<Configuracoes />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
