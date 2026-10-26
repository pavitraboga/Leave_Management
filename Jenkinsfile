pipeline {
    agent any

    environment {
        IMAGE_NAME = 'leave-app'
        IMAGE_TAG  = "${env.BUILD_NUMBER}"
    }

    triggers {
        // Checks the Git repo every minute; a push starts the pipeline automatically.
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
                sh 'docker build --build-arg APP_VERSION=${IMAGE_TAG} -t ${IMAGE_NAME}:${IMAGE_TAG} -t ${IMAGE_NAME}:latest .'
            }
        }

        stage('Deploy') {
            steps {
                sh 'IMAGE_TAG=${IMAGE_TAG} docker compose up -d --no-build'
            }
        }

        stage('Health Check') {
            steps {
                // The app is reached via the host because Jenkins runs in its own container.
                sh '''
                  for i in $(seq 1 20); do
                    if curl -fs http://host.docker.internal:3000/health; then
                      echo ""
                      echo "Health check passed"
                      exit 0
                    fi
                    echo "Waiting for app... ($i)"
                    sleep 3
                  done
                  echo "Health check FAILED"
                  docker compose logs app --tail 50
                  exit 1
                '''
            }
        }
    }

    post {
        success {
            echo "Deployed ${IMAGE_NAME}:${IMAGE_TAG} -> http://localhost:3000"
        }
        failure {
            echo 'Pipeline failed - the previous version is still running.'
        }
        always {
            sh 'docker image prune -f || true'
        }
    }
}
