from django.tasks import task
from django.urls import path
from . import views
from django.contrib.auth.decorators import login_required
from django.urls import include
from django.contrib import admin

urlpatterns =[
    path('',views.home, name='home' ),
    path('register/',views.register, name='register'),
    path('delete/<int:task_id>/',views.delete_task, name='delete_task'),
    path('edit/<int:task_id>/',views.edit_task, name='edit_task'),
    path('toggle_status/<int:task_id>/',views.toggle_status, name='toggle_status'),
    path("api/tasks/", views.api_task, name="api_tasks"),
    path('api/login/', views.manual_login, name='manual_login'),
    path('api/register/', views.register_user, name='register_user'),
    path('api/tasks/<int:task_id>/upload/', views.upload_file, name='upload_file'),
    path('api/tasks/<int:task_id>/generate-solution/', views.generate_solution, name='generate_solution'),
    path('api/tasks/<int:task_id>/generate-summary/', views.generate_summary, name='generate_summary'),
    path('api/tasks/<int:task_id>/generate-quiz/', views.generate_quiz, name='generate_quiz'),
    path('admin/', admin.site.urls , name='admin_panel'),
    
    

]
