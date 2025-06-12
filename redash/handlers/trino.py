import redis
import logging
from datetime import datetime, timedelta

from flask import request
from flask_restful import Resource

from redash.handlers.base import BaseResource, require_fields
from redash.permissions import require_permission

logger = logging.getLogger(__name__)


class TrinoScaleoutResource(BaseResource):
    @require_permission("admin")
    def post(self):
        """
        Trino 클러스터 Scale-out 요청을 Redis에 전송합니다.
        """
        try:
            # 요청 파라미터 파싱 (기본값 설정)
            args = request.get_json() or {}
            scale_size = args.get('scale_size', 20)  # 기본 스케일 크기: 20
            hours_to_expire = args.get('hours_to_expire', 2)  # 기본 만료 시간: 2시간
            
            # 만료 시간 계산
            expire_at = datetime.now() + timedelta(hours=hours_to_expire)
            expire_at_str = expire_at.strftime("%Y-%m-%dT%H:%M:%S")
            
            # Redis 연결
            r = redis.Redis(
                host='dable-common-data.mcyjv1.ng.0001.apn2.cache.amazonaws.com',
                port=6379, 
                db=0, 
                decode_responses=True,
                socket_timeout=10,
                socket_connect_timeout=10
            )
            
            # 스케일 정보를 Redis에 추가
            value = f"{scale_size}#{expire_at_str}"
            result = r.lpush("eda-trino-scale-out", value)
            
            logger.info(f"Trino scale-out request sent successfully. Scale size: {scale_size}, Expire at: {expire_at_str}")
            
            return {
                "success": True,
                "message": f"Trino Scale-out 요청이 성공적으로 전송되었습니다. (Scale: {scale_size}, 만료: {expire_at_str})",
                "scale_size": scale_size,
                "expire_at": expire_at_str,
                "redis_list_length": result
            }
            
        except redis.ConnectionError as e:
            logger.error(f"Redis connection failed: {str(e)}")
            return {
                "success": False,
                "message": "Redis 서버에 연결할 수 없습니다. 네트워크 상태를 확인해주세요."
            }, 500
            
        except redis.TimeoutError as e:
            logger.error(f"Redis operation timed out: {str(e)}")
            return {
                "success": False,
                "message": "Redis 작업이 시간 초과되었습니다."
            }, 500
            
        except redis.RedisError as e:
            logger.error(f"Redis error occurred: {str(e)}")
            return {
                "success": False,
                "message": f"Redis 오류가 발생했습니다: {str(e)}"
            }, 500
            
        except Exception as e:
            logger.error(f"Unexpected error occurred: {str(e)}")
            return {
                "success": False,
                "message": f"예상치 못한 오류가 발생했습니다: {str(e)}"
            }, 500