import redis
import logging
from datetime import datetime, timedelta

from flask import request
from flask_restful import Resource

from redash.handlers.base import BaseResource, require_fields
from redash.permissions import require_permission

logger = logging.getLogger(__name__)


class TrinoScaleoutResource(BaseResource):
    @require_permission("execute_query")
    def post(self):
        """
        Send EDA performance boost request to Redis.
        """
        try:
            # Performance level mapping
            SCALE_MAPPING = {
                'MAXIMUM': 20,
                'STANDARD': 10,
                'LIGHT': 5
            }
            
            # Parse request parameters with defaults
            args = request.get_json() or {}
            scale_level = args.get('scale_level', 'LIGHT')  # Default performance level: LIGHT
            hours_to_expire = args.get('hours_to_expire', 0.5)  # Default duration: 30 minutes
            
            # Convert performance level to actual worker count
            scale_size = SCALE_MAPPING.get(scale_level, SCALE_MAPPING['LIGHT'])
            
            # Calculate expiration time
            expire_at = datetime.now() + timedelta(hours=hours_to_expire)
            expire_at_str = expire_at.strftime("%Y-%m-%dT%H:%M:%S")
            
            # Redis connection
            r = redis.Redis(
                host='dable-common-data.mcyjv1.ng.0001.apn2.cache.amazonaws.com',
                port=6379, 
                db=0, 
                decode_responses=True,
                socket_timeout=10,
                socket_connect_timeout=10
            )
            
            # Add performance boost info to Redis
            value = f"{scale_size}#{expire_at_str}"
            result = r.lpush("eda-trino-scale-out", value)
            
            logger.info(f"EDA performance boost request sent successfully. Performance level: {scale_level}, Worker count: {scale_size}, Expire at: {expire_at_str}")
            
            return {
                "success": True,
                "message": f"Performance boost applied successfully! Level: {scale_level}, Workers: {scale_size}, Duration: {hours_to_expire * 60:.0f}min" if hours_to_expire < 1 else f"Performance boost applied successfully! Level: {scale_level}, Workers: {scale_size}, Duration: {hours_to_expire:.0f}h",
                "scale_level": scale_level,
                "scale_size": scale_size,
                "expire_at": expire_at_str,
                "redis_list_length": result
            }
            
        except redis.ConnectionError as e:
            logger.error(f"Redis connection failed: {str(e)}")
            return {
                "success": False,
                "message": "Unable to connect to Redis server. Please check network connectivity."
            }, 500
            
        except redis.TimeoutError as e:
            logger.error(f"Redis operation timed out: {str(e)}")
            return {
                "success": False,
                "message": "Redis operation timed out. Please try again later."
            }, 500
            
        except redis.RedisError as e:
            logger.error(f"Redis error occurred: {str(e)}")
            return {
                "success": False,
                "message": f"Redis error: {str(e)}"
            }, 500
            
        except Exception as e:
            logger.error(f"Unexpected error occurred: {str(e)}")
            return {
                "success": False,
                "message": f"Unexpected error occurred: {str(e)}"
            }, 500