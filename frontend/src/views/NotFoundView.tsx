import { Link, useLocation } from 'react-router'
import { route } from '../app/routes'
import { StateMessage } from '../components/ui'

export function NotFoundView() {
  const location = useLocation()
  const from = new URLSearchParams(location.search).get('from')
  return (
    <div className="flex min-h-0 flex-1 flex-col px-2">
      <h1 id="view-title" tabIndex={-1} className="sr-only">
        找不到頁面
      </h1>
      <StateMessage
        title="找不到這個頁面"
        actions={
          <>
            <Link to={route.latest()} className="btn btn-primary">
              前往最新日報
            </Link>
            <Link to={route.archive()} className="btn">
              查看封存
            </Link>
          </>
        }
      >
        <p className="mono break-all text-meta text-fg-3">{from ?? location.pathname}</p>
      </StateMessage>
    </div>
  )
}
