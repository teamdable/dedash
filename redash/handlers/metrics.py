from redash.handlers import routes
from redash.monitor import rq_workers

@routes.route("/metrics", methods=["GET"])
def metrics():
    workers = rq_workers()
    prometheus_metrics = []
    
    # Add metric descriptions
    prometheus_metrics.append('# HELP redash_worker_state Current state of the worker (1=idle, 0=busy)')
    prometheus_metrics.append('# HELP redash_worker_successful_jobs Total number of successful jobs processed by the worker')
    prometheus_metrics.append('# HELP redash_worker_failed_jobs Total number of failed jobs processed by the worker')
    prometheus_metrics.append('# HELP redash_worker_total_working_time Total time spent processing jobs in seconds')
    prometheus_metrics.append('# HELP redash_worker_last_heartbeat Timestamp of the last heartbeat from the worker')
    
    for worker in workers:
        # Worker 상태 (1=idle, 0=busy)
        prometheus_metrics.append('# TYPE redash_worker_state gauge')
        prometheus_metrics.append(f'redash_worker_state{{name="{worker["name"]}",hostname="{worker["hostname"]}",queues="{worker["queues"]}"}} {1 if worker["state"] == "idle" else 0}')
        
        # 성공/실패 작업 수
        prometheus_metrics.append('# TYPE redash_worker_successful_jobs counter')
        prometheus_metrics.append(f'redash_worker_successful_jobs{{name="{worker["name"]}",hostname="{worker["hostname"]}",queues="{worker["queues"]}"}} {worker["successful_jobs"]}')
        
        prometheus_metrics.append('# TYPE redash_worker_failed_jobs counter')
        prometheus_metrics.append(f'redash_worker_failed_jobs{{name="{worker["name"]}",hostname="{worker["hostname"]}",queues="{worker["queues"]}"}} {worker["failed_jobs"]}')
        
        # 총 작업 시간
        prometheus_metrics.append('# TYPE redash_worker_total_working_time gauge')
        prometheus_metrics.append(f'redash_worker_total_working_time{{name="{worker["name"]}",hostname="{worker["hostname"]}",queues="{worker["queues"]}"}} {worker["total_working_time"]}')
        
        # 마지막 heartbeat timestamp
        prometheus_metrics.append('# TYPE redash_worker_last_heartbeat gauge')
        prometheus_metrics.append(f'redash_worker_last_heartbeat{{name="{worker["name"]}",hostname="{worker["hostname"]}",queues="{worker["queues"]}"}} {worker["last_heartbeat"].timestamp()}')

    return "\n".join(prometheus_metrics), 200, {"Content-Type": "text/plain; version=0.0.4"}
