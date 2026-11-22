from django.contrib import admin

from .models import Assignment, Classroom, Membership

admin.site.register(Classroom)
admin.site.register(Membership)
admin.site.register(Assignment)
