import { Settings } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { Page } from '../../components/ui'
import { AppUpdateCard } from '../../ota/AppUpdateCard'
import { BodyProfileCard } from '../body/BodyProfile'
import { GarminCard } from '../garmin/GarminCard'
import { HealthConnectCard } from '../healthconnect/HealthConnectCard'
import { isAndroidApp } from '../healthconnect/plugin'
import { SisrunCard } from '../sisrun/SisrunCard'
import { StatusCard } from '../status/StatusCard'
import { BackupCard } from './cards/BackupCard'
import { NavBarCard } from './cards/NavBarCard'
import { ProfileCard } from './cards/ProfileCard'
import { SmartRemindersCard, WorkoutRemindersCard } from './cards/RemindersCards'
import { SitesCard } from './cards/SitesCard'
import { StorageCard } from './cards/StorageCard'
import { SyncCard } from './cards/SyncCard'

/**
 * Ajustes, in groups. Each group, and the cards other screens point at, can be opened straight from a
 * link: /ajustes?secao=fontes, ?secao=garmin, ?secao=sobre-mim…
 */
export default function SettingsPage() {
  const [params] = useSearchParams()
  const section = params.get('secao')

  useEffect(() => {
    if (!section) return
    document.querySelector(`[data-secao="${CSS.escape(section)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [section])

  return (
    <Page title="Ajustes" icon={Settings} tone="settings">
      <Group id="conta" title="Conta">
        <Anchor id="estado">
          <StatusCard />
        </Anchor>
        <Anchor id="sincronizacao">
          <SyncCard />
        </Anchor>
      </Group>

      <Group id="perfil" title="Perfil">
        <Anchor id="sobre-mim">
          <ProfileCard />
        </Anchor>
        <BodyProfileCard />
        <SitesCard />
      </Group>

      {isAndroidApp() && (
        <Group id="lembretes" title="Lembretes">
          <SmartRemindersCard />
          <WorkoutRemindersCard />
        </Group>
      )}

      <Group id="aparencia" title="Aparência">
        <NavBarCard />
      </Group>

      <Group id="fontes" title="Fontes de dados">
        <Anchor id="garmin">
          <GarminCard />
        </Anchor>
        <Anchor id="sisrun">
          <SisrunCard />
        </Anchor>
        <Anchor id="health-connect">
          <HealthConnectCard />
        </Anchor>
      </Group>

      <Group id="dados" title="Dados e app">
        <Anchor id="atualizacao">
          <AppUpdateCard />
        </Anchor>
        <Anchor id="backup">
          <BackupCard />
        </Anchor>
        <StorageCard />
      </Group>
    </Page>
  )
}

/** A titled run of cards. One whose cards all have nothing to show (a source not set up) hides its title too. */
function Group({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <div data-secao={id} className="flex scroll-mt-4 flex-col gap-4 pt-2 first:pt-0 [&:not(:has(section))]:hidden">
      <h2 className="px-1 text-xs font-semibold tracking-wide text-muted uppercase">{title}</h2>
      {children}
    </div>
  )
}

/** A card a link can open the page at; with no card inside (it has nothing to show) it takes no room. */
function Anchor({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div data-secao={id} className="scroll-mt-4 empty:hidden">
      {children}
    </div>
  )
}
