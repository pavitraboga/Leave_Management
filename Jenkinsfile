// Absenta CI/CD pipeline
// Test -> Build -> Deploy local (docker compose) -> Health check local
//      -> Push to Docker Hub -> Deploy to Render -> Health check public URL
pipeline {
    agent any

    environment {
        // ======== CHANGE THESE TWO LINES ========
        IMAGE      = 'docker.io/pavitra27/absenta'
        RENDER_URL = 'https://absenta.onrender.com'
        // ========================================
        IMAGE_TAG  = "${env.BUILD_NUMBER}"
    }

    triggers {
        // Checks GitHub every minute; a push starts the pipeline automatically.
        pollSCM('* * * * *')
    }

    options {
        timestamps()
        disableConcurrentBuilds()
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Test') {
            agent {
                docker {
                    image 'node:20'
                    reuseNode true
                }
            }
            steps {
                sh 'npm ci'
                sh 'npm test'
            }
            post {
                always {
                    junit 'reports/junit.xml'
                }
            }
        }

        stage('Build Image') {
            steps {
                // linux/amd64 so the image runs on Render even if built on an ARM laptop
                sh 'docker build --platform linux/amd64 --build-arg APP_VERSION=$IMAGE_TAG -t $IMAGE:$IMAGE_TAG -t $IMAGE:latest .'
            }
        }

        stage('Deploy Local') {
            steps {
                sh 'IMAGE=$IMAGE IMAGE_TAG=$IMAGE_TAG docker compose up -d --no-build'
            }
        }

        stage('Health Check Local') {
            steps {
                sh '''
                  for i in $(seq 1 20); do
                    if curl -fs http://host.docker.internal:3000/health; then
                      echo ""; echo "Local health check passed"; exit 0
                    fi
                    echo "Waiting for local app... ($i)"; sleep 3
                  done
                  echo "Local health check FAILED"
                  docker compose logs app --tail 50
                  exit 1
                '''
            }
        }

        stage('Push to Docker Hub') {
            steps {
                withCredentials([usernamePassword(credentialsId: 'dockerhub',
                                                  usernameVariable: 'DH_USER',
                                                  passwordVariable: 'DH_TOKEN')]) {
                    sh '''
                      echo "$DH_TOKEN" | docker login -u "$DH_USER" --password-stdin
                      docker push $IMAGE:$IMAGE_TAG
                      docker push $IMAGE:latest
                    '''
                }
            }
        }

        stage('Deploy to Render') {
            steps {
                withCredentials([string(credentialsId: 'render-deploy-hook', variable: 'HOOK')]) {
                    sh '''
                      IMG_URL=$(printf '%s' "$IMAGE:$IMAGE_TAG" | sed 's#/#%2F#g; s#:#%3A#g')
                      curl -fsS -X POST "$HOOK&imgURL=$IMG_URL" > /dev/null
                      echo "Render deploy triggered for $IMAGE:$IMAGE_TAG"
                    '''
                }
            }
        }

        stage('Health Check Render') {
            steps {
                // Waits until the public URL is healthy AND reports this build's version.
                sh '''
                  for i in $(seq 1 40); do
                    BODY=$(curl -fs --max-time 20 $RENDER_URL/health || true)
                    if echo "$BODY" | grep -q "\\"version\\":\\"$IMAGE_TAG\\""; then
                      echo "$BODY"; echo "Render is live with build $IMAGE_TAG -> $RENDER_URL"; exit 0
                    fi
                    echo "Waiting for Render to roll out build $IMAGE_TAG... ($i)"; sleep 15
                  done
                  echo "Render health check FAILED"; exit 1
                '''
            }
        }
    }

    post {
        success {
            echo "Deployed build ${IMAGE_TAG}: local http://localhost:3000 | public ${RENDER_URL}"
        }
        failure {
            echo 'Pipeline failed - the previous version is still running locally and on Render.'
        }
        always {
            sh 'docker logout || true'
            sh 'docker image prune -f || true'
        }
    }
}
