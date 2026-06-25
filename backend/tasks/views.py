from django.shortcuts import render,redirect,get_object_or_404
from .models import Task, TaskFile, AIResponse
from django.contrib.auth.decorators import login_required
from django.contrib.auth.forms import UserCreationForm
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
import json
import os
from django.contrib.auth.models import User
from django.contrib.auth import authenticate, login
from .utils import extract_text_from_file, call_gemini_api


@csrf_exempt
def api_task(request):
    current_user = request.user
    if current_user.is_anonymous:
        current_user = User.objects.first()

    if not current_user:
        return JsonResponse({"error": "User not authenticated"}, status=401)

    if request.method == "GET":
        tasks = Task.objects.filter(user=current_user).order_by('-created_at')
        data = []

        for task in tasks:
            files = []
            for tf in task.taskfile_set.all():
                files.append({
                    "id": tf.id,
                    "name": os.path.basename(tf.file.name),
                    "url": request.build_absolute_uri(tf.file.url) if tf.file else ""
                })

            ai_responses = {}
            for resp in task.airesponse_set.all():
                ai_responses[resp.response_type] = {
                    "id": resp.id,
                    "response_type": resp.response_type,
                    "extracted_text": resp.extracted_text,
                    "generated_answer": resp.generated_answer,
                    "created_at": resp.created_at
                }

            data.append({
                "id": task.id,
                "title": task.title,
                "subject": task.subject,
                "priority": task.priority,
                "status": task.status,
                "due_date": task.due_date,
                "files": files,
                "ai_responses": ai_responses
            })

        return JsonResponse(data, safe=False)

    elif request.method == "POST":
        body = json.loads(request.body)

        task = Task.objects.create(
            user=current_user,
            title=body["title"],
            subject=body["subject"],
            priority=body["priority"],
            status="PENDING",
            due_date=body.get("due_date")
        )

        return JsonResponse({
            "id": task.id,
            "title": task.title,
            "subject": task.subject,
            "priority": task.priority,
            "status": task.status,
            "due_date": task.due_date,
            "files": [],
            "ai_responses": {}
        })

     
@login_required
def home(request):
    
    
    if request.method =="POST":
        title = request.POST.get("title")
        subject= request.POST.get("subject")
        due_date = request.POST.get("due_date")
        priority = request.POST.get("priority")

        Task.objects.create(
            user=request.user,
            title=title,
            subject=subject,
            due_date=due_date,
            priority=priority,
        )
        return redirect('home')
        
    tasks = Task.objects.filter(user=request.user).order_by('-created_at')

    total_tasks=tasks.count()
    completed_task=tasks.filter(status='COMPLETED').count()
    pending_task=tasks.filter(status='PENDING').count()

    context={
         "tasks":tasks,
         "total_tasks": total_tasks,
         "completed_task":completed_task,
         "pending_task":pending_task,
    }
    return render(request,'tasks/home.html', context)
    
        
    

def register(request):
    if request.method=="POST":
        form = UserCreationForm(request.POST)
        if form.is_valid():
            form.save()
            return redirect('login')
    else:
            form = UserCreationForm()

    return render(request,'registration/register.html', {'form': form})

@login_required
@csrf_exempt # Add this if you aren't sending CSRF tokens from React

def delete_task(request, task_id):
    task = get_object_or_404(Task, id=task_id, user=request.user)
    task.delete()
    return JsonResponse({"message": "Deleted successfully"}, status=200)

@login_required
def edit_task(request,task_id):
     task= get_object_or_404(Task, id=task_id, user=request.user)
     if request.method=="POST":
        task.title =request.POST.get("title")
        task.subject=request.POST.get("subject")
        task.due_date=request.POST.get("due_date")
        task.priority=request.POST.get("priority")
        task.save()
        return redirect('home')
     return render(request, "tasks/edit_task.html",{"task": task})

@csrf_exempt
def toggle_status(request, task_id):
    # Retrieve the specific task
    task = get_object_or_404(Task, id=task_id)
    
    # Toggle logic
    if task.status == 'PENDING':
        task.status = 'COMPLETED'
    else:
        task.status = 'PENDING'
    
    task.save()
    
    # Return the new status to the frontend
    return JsonResponse({
        "id": task.id,
        "status": task.status
    })

# backend/tasks/views.py
@csrf_exempt
def register_user(request):
    if request.method == "POST":
        data = json.loads(request.body)
        try:
            # Create the user in the Django Auth system
            user = User.objects.create_user(
                username=data['username'],
                email=data['email'],
                password=data['password']
            )
            user.first_name = data.get('first_name', '')
            user.save()
            return JsonResponse({"status": "success", "message": "User created!"})
        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=400)

@csrf_exempt
def manual_login(request):
    if request.method == "POST":
        try:
            data = json.loads(request.body)
            username = data.get("username") # Now matches the React 'name' attribute
            password = data.get("password")

            # Django checks the auth_user table for this username/password combo
            user = authenticate(username=username, password=password)
            
            if user is not None:
                login(request, user)
                return JsonResponse({
                    "status": "success", 
                    "user": {
                        "name": user.username, # Shows the username on the dashboard
                        "email": user.email
                    }
                })
            else:
                return JsonResponse({"status": "error", "message": "Invalid username or password"}, status=401)
        except Exception as e:
            return JsonResponse({"status": "error", "message": str(e)}, status=400)
            
    return JsonResponse({"status": "error", "message": "Method not allowed"}, status=405)


@csrf_exempt
def upload_file(request, task_id):
    current_user = request.user
    if current_user.is_anonymous:
        current_user = User.objects.first()
    
    if not current_user:
        return JsonResponse({"error": "User not authenticated"}, status=401)

    task = get_object_or_404(Task, id=task_id, user=current_user)

    if request.method == "POST":
        if 'file' not in request.FILES:
            return JsonResponse({"error": "No file provided"}, status=400)
        
        uploaded_file = request.FILES['file']
        
        # Validation for unsupported file types
        ext = os.path.splitext(uploaded_file.name)[1].lower()
        if ext not in ['.pdf', '.docx', '.jpg', '.png', '.jpeg']:
            return JsonResponse({"error": "Unsupported file type. Allowed: PDF, DOCX, JPG, PNG"}, status=400)
        
        task_file = TaskFile.objects.create(task=task, file=uploaded_file)
        
        return JsonResponse({
            "id": task_file.id,
            "name": os.path.basename(task_file.file.name),
            "url": request.build_absolute_uri(task_file.file.url)
        }, status=201)
    
    return JsonResponse({"error": "Method not allowed"}, status=405)


def process_ai_action(request, task_id, response_type):
    current_user = request.user
    if current_user.is_anonymous:
        current_user = User.objects.first()
    
    if not current_user:
        return JsonResponse({"error": "User not authenticated"}, status=401)
        
    task = get_object_or_404(Task, id=task_id, user=current_user)
    
    # Retrieve files
    task_files = TaskFile.objects.filter(task=task)
    if not task_files.exists():
        return JsonResponse({"error": "No files uploaded for this task. Please upload a file first."}, status=400)
        
    full_extracted_text = ""
    extraction_errors = []
    
    for tf in task_files:
        try:
            file_path = tf.file.path
            text = extract_text_from_file(file_path)
            if text:
                full_extracted_text += f"\n--- Content from {os.path.basename(tf.file.name)} ---\n" + text
        except Exception as e:
            extraction_errors.append(f"{os.path.basename(tf.file.name)}: {str(e)}")
            
    if not full_extracted_text.strip():
        error_msg = "Could not extract any text from the uploaded files. "
        if extraction_errors:
            error_msg += "Errors: " + "; ".join(extraction_errors)
        return JsonResponse({"error": error_msg}, status=400)
        
    # Send to Gemini
    try:
        answer = call_gemini_api(response_type, full_extracted_text)
        
        # Save in AIResponse model
        ai_resp, created = AIResponse.objects.update_or_create(
            task=task,
            response_type=response_type,
            defaults={
                'extracted_text': full_extracted_text,
                'generated_answer': answer
            }
        )
        
        return JsonResponse({
            "id": ai_resp.id,
            "response_type": ai_resp.response_type,
            "extracted_text": ai_resp.extracted_text,
            "generated_answer": ai_resp.generated_answer,
            "created_at": ai_resp.created_at
        })
    except Exception as e:
        return JsonResponse({"error": f"AI Generation failed: {str(e)}"}, status=500)


@csrf_exempt
def generate_solution(request, task_id):
    return process_ai_action(request, task_id, 'SOLUTION')


@csrf_exempt
def generate_summary(request, task_id):
    return process_ai_action(request, task_id, 'SUMMARY')


@csrf_exempt
def generate_quiz(request, task_id):
    return process_ai_action(request, task_id, 'QUIZ')