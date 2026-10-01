import { Link, useLocation } from 'react-router'
import { route } from '../app/routes'
import { StateMessage } from '../components/ui'
import { useLang } from '../state/lang'

export function NotFoundView() {
  const location = useLocation()
  const { t } = useLang()
  const from = new URLSearchParams(location.search).get('from')
  return (
    <div className="flex min-h-0 flex-1 flex-col px-2">
      <h1 id="view-title" tabIndex={-1} className="sr-only">
        {t('找不到頁面', 'Page not found')}
      </h1>
      <StateMessage
        title={t('找不到這個頁面', 'This page does not exist')}
        actions={
          <>
            <Link to={route.latest()} className="btn btn-primary">
              {t('前往最新日報', 'Go to the latest digest')}
            </Link>
            <Link to={route.archive()} className="btn">
              {t('查看封存', 'Open the archive')}
            </Link>
          </>
        }
      >
        <p className="mono break-all text-meta text-fg-3">{from ?? location.pathname}</p>
      </StateMessage>
    </div>
  )
}
